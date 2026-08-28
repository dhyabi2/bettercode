import { LayerNode } from "@bettercode-ai/core/effect/layer-node"
import { Cause, Duration, Effect, Layer, Schedule, Schema, Semaphore, Context } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { formatPatch, structuredPatch } from "diff"
import path from "path"
import { AppProcess } from "@bettercode-ai/core/process"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@bettercode-ai/core/fs-util"
import { Hash } from "@bettercode-ai/core/util/hash"
import { Config } from "@/config/config"
import { Global } from "@bettercode-ai/core/global"
import { Info } from "@bettercode-ai/schema/file-diff"
import { GIT_NO_PROMPT_ENV, GIT_SUBPROCESS_TIMEOUT } from "@/git"

export const Patch = Schema.Struct({
  hash: Schema.String,
  files: Schema.mutable(Schema.Array(Schema.String)),
})
export type Patch = typeof Patch.Type

export const FileDiff = Info
export type FileDiff = typeof FileDiff.Type

export class RestoreError extends Schema.TaggedErrorClass<RestoreError>()("SnapshotRestoreError", {
  snapshot: Schema.String,
  exitCode: Schema.Number,
  stderr: Schema.String,
  phase: Schema.Literals(["read-tree", "checkout-index", "verify"]),
}) {}

const prune = "7.days"
const limit = 2 * 1024 * 1024
const totalLimit = 50 * 1024 * 1024
const MAX_PATCH_BYTES = 10_000_000
const MAX_TOTAL_PATCH_BYTES = 10_000_000
const PATCH_CONTEXT_LINES = 8
const emptyPatch = (file: string) => formatPatch(structuredPatch(file, file, "", "", "", "", { context: 0 }))
const core = ["-c", "core.longpaths=true", "-c", "core.symlinks=true"]
const cfg = ["-c", "core.autocrlf=false", ...core]
const quote = [...cfg, "-c", "core.quotepath=false"]
interface GitResult {
  readonly code: ChildProcessSpawner.ExitCode
  readonly text: string
  readonly stderr: string
  readonly spawnError?: boolean
}

type State = Omit<Interface, "init">

export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly cleanup: () => Effect.Effect<void>
  readonly enabled: () => Effect.Effect<boolean>
  readonly track: () => Effect.Effect<string | undefined>
  readonly patch: (hash: string, toHash?: string) => Effect.Effect<Patch>
  readonly restore: (snapshot: string) => Effect.Effect<void, RestoreError>
  readonly revert: (patches: Patch[]) => Effect.Effect<void>
  readonly diff: (hash: string) => Effect.Effect<string>
  readonly diffFull: (from: string, to: string, options?: { patch?: boolean }) => Effect.Effect<FileDiff[]>
}

export class Service extends Context.Service<Service, Interface>()("@bettercode/Snapshot") {}

const layer: Layer.Layer<Service, never, FSUtil.Service | AppProcess.Service | Config.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const appProcess = yield* AppProcess.Service
    const config = yield* Config.Service
    const locks = new Map<string, Semaphore.Semaphore>()

    const lock = (key: string) => {
      const hit = locks.get(key)
      if (hit) return hit

      const next = Semaphore.makeUnsafe(1)
      locks.set(key, next)
      return next
    }

    const state = yield* InstanceState.make<State>(
      Effect.fn("Snapshot.state")(function* (ctx) {
        const state = {
          directory: ctx.directory,
          worktree: ctx.worktree,
          gitdir: path.join(Global.Path.data, "snapshot", ctx.project.id, Hash.fast(ctx.worktree)),
          vcs: ctx.project.vcs,
          lastHash: undefined as string | undefined,
        }

        const args = (cmd: string[]) => ["--git-dir", state.gitdir, "--work-tree", state.worktree, ...cmd]

        const encodeNulTerminatedPaths = (files: string[]) => files.join("\0") + "\0"
        const encodeTopLevelLiteralPathspecs = (files: string[]) =>
          encodeNulTerminatedPaths(files.map((file) => `:(top,literal)${file}`))

        const git = Effect.fnUntraced(
          function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string>; stdin?: string }) {
            const result = yield* appProcess.run(
              ChildProcess.make("git", cmd, {
                cwd: opts?.cwd,
                env: { ...GIT_NO_PROMPT_ENV, ...opts?.env },
                extendEnv: true,
              }),
              { stdin: opts?.stdin, timeout: GIT_SUBPROCESS_TIMEOUT },
            )
            return {
              code: ChildProcessSpawner.ExitCode(result.exitCode),
              text: result.stdout.toString("utf8"),
              stderr: result.stderr.toString("utf8"),
            } satisfies GitResult
          },
          Effect.catch((err) =>
            Effect.succeed({
              code: ChildProcessSpawner.ExitCode(1),
              text: "",
              stderr: err instanceof Error ? err.message : String(err),
              spawnError: true,
            }),
          ),
        )

        const ignore = Effect.fnUntraced(function* (files: string[]) {
          if (!files.length) return new Set<string>()
          // check-ignore treats a leading colon as pathspec magic but accepts and echoes a protective ./ prefix.
          const checkIgnorePaths = files.map((item) => (item.startsWith(":") ? `./${item}` : item))
          const check = yield* git(
            [
              ...quote,
              "--git-dir",
              path.join(state.worktree, ".git"),
              "--work-tree",
              state.worktree,
              "check-ignore",
              "--no-index",
              "--stdin",
              "-z",
            ],
            {
              cwd: state.worktree,
              stdin: encodeNulTerminatedPaths(checkIgnorePaths),
            },
          )
          if (check.code !== 0 && check.code !== 1) return new Set<string>()
          return new Set(
            check.text
              .split("\0")
              .filter(Boolean)
              .map((item) => (item.startsWith("./:") ? item.slice(2) : item)),
          )
        })

        const drop = Effect.fnUntraced(function* (files: string[]) {
          if (!files.length) return
          yield* git(
            [
              ...cfg,
              ...args(["rm", "--cached", "-f", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"]),
            ],
            {
              cwd: state.worktree,
              stdin: encodeTopLevelLiteralPathspecs(files),
            },
          )
        })

        const stage = Effect.fnUntraced(function* (files: string[]) {
          if (!files.length) return
          const result = yield* git(
            [...cfg, ...args(["add", "--all", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"])],
            {
              cwd: state.worktree,
              stdin: encodeTopLevelLiteralPathspecs(files),
            },
          )
          if (result.code === 0) return
          yield* Effect.logWarning("failed to add snapshot files", {
            exitCode: result.code,
            stderr: result.stderr,
          })
        })

        const objectExists = Effect.fnUntraced(function* (hash: string) {
          const result = yield* git([...core, ...args(["cat-file", "-e", hash])], { cwd: state.worktree })
          return result.code === 0
        })

        const exists = (file: string) => fs.exists(file).pipe(Effect.orDie)
        const read = (file: string) => fs.readFileString(file).pipe(Effect.catch(() => Effect.succeed("")))
        const remove = (file: string) => fs.remove(file).pipe(Effect.catch(() => Effect.void))
        const lockTimeout = Duration.sum(GIT_SUBPROCESS_TIMEOUT, Duration.seconds(15))
        const locked = <A, E, R>(fx: Effect.Effect<A, E, R>, fallback: () => A) =>
          Effect.timeoutOrElse(lock(state.gitdir).withPermits(1)(fx), {
            duration: lockTimeout,
            orElse: () => Effect.logWarning("snapshot lock acquisition timed out, skipping").pipe(Effect.as(fallback())),
          })

        const enabled = Effect.fnUntraced(function* () {
          if (state.vcs !== "git") return false
          return (yield* config.get()).snapshot !== false
        })

        const excludes = Effect.fnUntraced(function* () {
          const result = yield* git(["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], {
            cwd: state.worktree,
          })
          const file = result.text.trim()
          if (!file) return
          if (!(yield* exists(file))) return
          return file
        })

        const sync = Effect.fnUntraced(function* (list: string[] = []) {
          const file = yield* excludes()
          const target = path.join(state.gitdir, "info", "exclude")
          const text = [
            file ? (yield* read(file)).trimEnd() : "",
            ...list.map((item) => `/${item.replaceAll("\\", "/")}`),
          ]
            .filter(Boolean)
            .join("\n")
          yield* fs.ensureDir(path.join(state.gitdir, "info")).pipe(Effect.orDie)
          yield* fs.writeFileString(target, text ? `${text}\n` : "").pipe(Effect.orDie)
        })

        // Reuse the hashes for the git storage between the original repo and snapshot
        // on huge repos like chromium checkout the git add --all rebuilding the
        // hashes can take minutes. By doing this we eliminating this at all
        const seed = Effect.fnUntraced(function* () {
          if (state.vcs !== "git") return

          const commonDir = yield* git(["rev-parse", "--path-format=absolute", "--git-common-dir"], {
            cwd: state.worktree,
          })

          if (commonDir.code !== 0) return
          const source = commonDir.text.trim()
          if (!source || !(yield* exists(source))) return

          // Share the source object database (and the source's own alternates,
          // skipping any that no longer exist) so seeded blobs resolve.
          const sourceObjects = path.join(source, "objects")
          const chained = (yield* read(path.join(sourceObjects, "info", "alternates")))
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
          const alternates: string[] = []
          for (const candidate of [sourceObjects, ...chained]) {
            if (yield* exists(candidate)) alternates.push(candidate)
          }
          if (!alternates.length) return

          yield* fs.ensureDir(path.join(state.gitdir, "objects", "info")).pipe(Effect.orDie)
          yield* fs
            .writeFileString(path.join(state.gitdir, "objects", "info", "alternates"), alternates.join("\n") + "\n")
            .pipe(Effect.orDie)

          // Seed the index from the source repo so already-hashed entries are reused.
          // Best-effort: a missing/incompatible index just falls back to a full add.
          const sourceIndex = path.join(source, "index")
          if (yield* exists(sourceIndex)) {
            yield* fs.copyFile(sourceIndex, path.join(state.gitdir, "index")).pipe(Effect.catch(() => Effect.void))
          }
        })

        const add = Effect.fnUntraced(function* () {
          yield* sync()
          const [diff, other] = yield* Effect.all(
            [
              git([...quote, ...args(["diff-files", "--name-only", "-z", "--", "."])], {
                cwd: state.directory,
              }),
              git([...quote, ...args(["ls-files", "--full-name", "--others", "--exclude-standard", "-z", "--", "."])], {
                cwd: state.directory,
              }),
            ],
            { concurrency: 2 },
          )
          if (diff.code !== 0 || other.code !== 0) {
            yield* Effect.logWarning("failed to list snapshot files", {
              diffCode: diff.code,
              diffStderr: diff.stderr,
              otherCode: other.code,
              otherStderr: other.stderr,
            })
            return true
          }

          const tracked = diff.text.split("\0").filter(Boolean)
          const untracked = other.text.split("\0").filter(Boolean)
          const all = Array.from(new Set([...tracked, ...untracked]))
          if (!all.length) return false

          // Resolve source-repo ignore rules against the exact candidate set.
          // --no-index keeps this pattern-based even when a path is already tracked.
          const ignored = yield* ignore(all)

          // Remove newly-ignored files from snapshot index to prevent re-adding
          if (ignored.size > 0) {
            const ignoredFiles = Array.from(ignored)
            yield* Effect.logInfo("removing gitignored files from snapshot", { count: ignoredFiles.length })
            yield* drop(ignoredFiles)
          }

          const allow = all.filter((item) => !ignored.has(item))
          if (!allow.length) return true

          const stats = yield* Effect.all(
            allow.map((item) =>
              fs
                .stat(path.join(state.worktree, item))
                .pipe(Effect.catch(() => Effect.void))
                .pipe(
                  Effect.map((stat) => {
                    if (!stat || stat.type !== "File") return
                    const size = typeof stat.size === "bigint" ? Number(stat.size) : stat.size
                    return { item, size }
                  }),
                ),
            ),
            { concurrency: 8 },
          )
          const sizes = new Map<string, number>()
          const large = new Set<string>()
          for (const stat of stats) {
            if (!stat) continue
            sizes.set(stat.item, stat.size)
            if (stat.size > limit) large.add(stat.item)
          }

          // A large file may already be tracked in the snapshot index (e.g. it
          // grew past the limit after an earlier add()); untrack it so sync()'s
          // exclude entry actually takes effect on the next cycle.
          const trackedLarge = tracked.filter((item) => large.has(item))
          if (trackedLarge.length) yield* drop(trackedLarge)

          const block = large
          yield* sync(Array.from(block))

          // Stage only the allowed candidate paths so snapshot updates stay scoped,
          // capping the total bytes staged in a single pass so many just-under-the-
          // limit files can't collectively cause unbounded snapshot growth.
          let stagedBytes = 0
          const toStage: string[] = []
          for (const item of allow) {
            if (block.has(item)) continue
            const size = sizes.get(item) ?? 0
            if (stagedBytes + size > totalLimit) {
              yield* Effect.logWarning("snapshot staging cap reached, deferring remaining files", { item })
              break
            }
            stagedBytes += size
            toStage.push(item)
          }
          yield* stage(toStage)
          return true
        })

        const cleanup = Effect.fnUntraced(function* () {
          return yield* locked(
            Effect.gen(function* () {
              if (!(yield* enabled())) return
              if (!(yield* exists(state.gitdir))) return
              const result = yield* git(args(["gc", "--auto", `--prune=${prune}`]), { cwd: state.directory })
              if (result.code !== 0) {
                yield* Effect.logWarning("cleanup failed", {
                  exitCode: result.code,
                  stderr: result.stderr,
                })
                return
              }
              yield* Effect.logInfo("cleanup", { prune })
            }),
            () => undefined,
          )
        })

        const track = Effect.fnUntraced(function* () {
          return yield* locked(
            Effect.gen(function* () {
              if (!(yield* enabled())) return
              const existed = yield* exists(state.gitdir)
              yield* fs.ensureDir(state.gitdir).pipe(Effect.orDie)
              if (!existed) {
                yield* git(["init"], {
                  env: { GIT_DIR: state.gitdir, GIT_WORK_TREE: state.worktree },
                })
                yield* git(["--git-dir", state.gitdir, "config", "core.autocrlf", "false"])
                yield* git(["--git-dir", state.gitdir, "config", "core.longpaths", "true"])
                yield* git(["--git-dir", state.gitdir, "config", "core.symlinks", "true"])
                yield* git(["--git-dir", state.gitdir, "config", "core.fsmonitor", "false"])
                // Tuning for very large worktrees so the first add stays bounded.
                yield* git(["--git-dir", state.gitdir, "config", "feature.manyFiles", "true"])
                yield* git(["--git-dir", state.gitdir, "config", "index.version", "4"])
                yield* git(["--git-dir", state.gitdir, "config", "index.threads", "true"])
                yield* git(["--git-dir", state.gitdir, "config", "core.untrackedCache", "true"])
                yield* seed()
                yield* Effect.logInfo("initialized")
              }
              const changed = yield* add()
              if (!changed && state.lastHash) return state.lastHash
              const result = yield* git(args(["write-tree"]), { cwd: state.directory })
              if (result.code !== 0) {
                yield* Effect.logWarning("write-tree failed", {
                  exitCode: result.code,
                  stderr: result.stderr,
                  cwd: state.directory,
                })
                return undefined
              }
              const hash = result.text.trim()
              state.lastHash = hash
              yield* Effect.logInfo("tracking", { hash, cwd: state.directory, git: state.gitdir })
              return hash
            }),
            () => undefined,
          )
        })

        const patch = Effect.fnUntraced(function* (hash: string, toHash?: string) {
          return yield* locked(
            Effect.gen(function* () {
              // add() here can stage files without going through track(), so the cached
              // lastHash (used by track()'s write-tree short-circuit) is no longer
              // trustworthy once that happens — invalidate it so the next track() call
              // recomputes the tree instead of returning a stale hash.
              if (!toHash) {
                const changed = yield* add()
                if (changed) state.lastHash = undefined
              }
              const result = yield* git(
                toHash
                  ? [...quote, ...args(["diff", "--no-ext-diff", "--name-only", hash, toHash, "--", "."])]
                  : [...quote, ...args(["diff", "--cached", "--no-ext-diff", "--name-only", hash, "--", "."])],
                {
                  cwd: state.directory,
                },
              )
              if (result.code !== 0) {
                yield* Effect.logWarning("failed to get diff", { hash, exitCode: result.code })
                return { hash, files: [] }
              }
              const files = result.text
                .trim()
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean)

              // Hide ignored-file removals from the user-facing patch output.
              const ignored = yield* ignore(files)

              return {
                hash,
                files: files
                  .filter((item) => !ignored.has(item))
                  .map((x) => path.join(state.worktree, x).replaceAll("\\", "/")),
              }
            }),
            () => ({ hash, files: [] }),
          )
        })

        const restore = Effect.fnUntraced(function* (snapshot: string) {
          return yield* locked(
            Effect.gen(function* () {
              yield* Effect.logInfo("restore", { commit: snapshot })
              const result = yield* git([...core, ...args(["read-tree", snapshot])], { cwd: state.worktree })
              if (result.code !== 0) {
                yield* Effect.logError("failed to restore snapshot", {
                  snapshot,
                  exitCode: result.code,
                  stderr: result.stderr,
                })
                return yield* Effect.fail(
                  new RestoreError({
                    snapshot,
                    exitCode: Number(result.code),
                    stderr: result.stderr,
                    phase: "read-tree",
                  }),
                )
              }

              const checkout = yield* git([...core, ...args(["checkout-index", "-a", "-f"])], {
                cwd: state.worktree,
              })
              if (checkout.code !== 0) {
                yield* Effect.logError("failed to restore snapshot", {
                  snapshot,
                  exitCode: checkout.code,
                  stderr: checkout.stderr,
                })
                return yield* Effect.fail(
                  new RestoreError({
                    snapshot,
                    exitCode: Number(checkout.code),
                    stderr: checkout.stderr,
                    phase: "checkout-index",
                  }),
                )
              }

              const verify = yield* git([...core, ...args(["diff", "--no-ext-diff", "--quiet", snapshot, "--", "."])], {
                cwd: state.worktree,
              })
              if (verify.code !== 0) {
                yield* Effect.logError("snapshot restore verification failed", {
                  snapshot,
                  exitCode: verify.code,
                  stderr: verify.stderr,
                })
                return yield* Effect.fail(
                  new RestoreError({
                    snapshot,
                    exitCode: Number(verify.code),
                    stderr: verify.stderr,
                    phase: "verify",
                  }),
                )
              }
            }),
            () => undefined,
          )
        })

        const revert = Effect.fnUntraced(function* (patches: Patch[]) {
          return yield* locked(
            Effect.gen(function* () {
              const ops: { hash: string; file: string; rel: string }[] = []
              const seen = new Set<string>()
              for (const item of patches) {
                for (const file of item.files) {
                  if (seen.has(file)) continue
                  seen.add(file)
                  ops.push({
                    hash: item.hash,
                    file,
                    rel: path.relative(state.worktree, file).replaceAll("\\", "/"),
                  })
                }
              }

              const single = Effect.fnUntraced(function* (op: (typeof ops)[number]) {
                yield* Effect.logInfo("reverting", { file: op.file, hash: op.hash })
                const result = yield* git([...core, ...args(["checkout", op.hash, "--", op.file])], {
                  cwd: state.worktree,
                })
                if (result.code === 0) return
                if (!(yield* objectExists(op.hash))) {
                  yield* Effect.logError("snapshot object missing or unreadable, keeping file", {
                    file: op.file,
                    hash: op.hash,
                  })
                  return
                }
                const tree = yield* git([...core, ...args(["ls-tree", op.hash, "--", op.rel])], {
                  cwd: state.worktree,
                })
                if (tree.code === 0 && tree.text.trim()) {
                  yield* Effect.logInfo("file existed in snapshot but checkout failed, keeping", {
                    file: op.file,
                    hash: op.hash,
                  })
                  return
                }
                yield* Effect.logInfo("file did not exist in snapshot, deleting", { file: op.file, hash: op.hash })
                yield* remove(op.file)
              })

              const clash = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)

              for (let i = 0; i < ops.length; ) {
                const first = ops[i]!
                const run = [first]
                let j = i + 1
                // Only batch adjacent files when their paths cannot affect each other.
                while (j < ops.length && run.length < 100) {
                  const next = ops[j]!
                  if (next.hash !== first.hash) break
                  if (run.some((item) => clash(item.rel, next.rel))) break
                  run.push(next)
                  j += 1
                }

                if (run.length === 1) {
                  yield* single(first)
                  i = j
                  continue
                }

                if (!(yield* objectExists(first.hash))) {
                  yield* Effect.logError("snapshot object missing or unreadable, keeping files", {
                    hash: first.hash,
                    files: run.length,
                  })
                  i = j
                  continue
                }

                const tree = yield* git(
                  [...core, ...args(["ls-tree", "--name-only", first.hash, "--", ...run.map((item) => item.rel)])],
                  {
                    cwd: state.worktree,
                  },
                )

                if (tree.code !== 0) {
                  yield* Effect.logInfo("batched ls-tree failed, falling back to single-file revert", {
                    hash: first.hash,
                    files: run.length,
                  })
                  for (const op of run) {
                    yield* single(op)
                  }
                  i = j
                  continue
                }

                const have = new Set(
                  tree.text
                    .trim()
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                )
                const list = run.filter((item) => have.has(item.rel))
                if (list.length) {
                  yield* Effect.logInfo("reverting", { hash: first.hash, files: list.length })
                  const result = yield* git(
                    [...core, ...args(["checkout", first.hash, "--", ...list.map((item) => item.file)])],
                    {
                      cwd: state.worktree,
                    },
                  )
                  if (result.code !== 0) {
                    yield* Effect.logInfo("batched checkout failed, falling back to single-file revert", {
                      hash: first.hash,
                      files: list.length,
                    })
                    for (const op of run) {
                      yield* single(op)
                    }
                    i = j
                    continue
                  }
                }

                for (const op of run) {
                  if (have.has(op.rel)) continue
                  yield* Effect.logInfo("file did not exist in snapshot, deleting", { file: op.file, hash: op.hash })
                  yield* remove(op.file)
                }

                i = j
              }
            }),
            () => undefined,
          )
        })

        const diff = Effect.fnUntraced(function* (hash: string) {
          return yield* locked(
            Effect.gen(function* () {
              yield* add()
              const result = yield* git([...quote, ...args(["diff", "--cached", "--no-ext-diff", hash, "--", "."])], {
                cwd: state.worktree,
              })
              if (result.code !== 0) {
                yield* Effect.logWarning("failed to get diff", {
                  hash,
                  exitCode: result.code,
                  stderr: result.stderr,
                })
                return ""
              }
              return result.text.trim()
            }),
            () => "",
          )
        })

        const diffFull = Effect.fnUntraced(function* (from: string, to: string, options?: { patch?: boolean }) {
          const withPatch = options?.patch ?? true
          return yield* locked(
            Effect.gen(function* () {
              type Row = {
                file: string
                status: "added" | "deleted" | "modified"
                binary: boolean
                additions: number
                deletions: number
              }

              type Ref = {
                file: string
                side: "before" | "after"
                ref: string
              }

              const show = Effect.fnUntraced(function* (row: Row) {
                if (row.binary) return ["", ""]
                if (row.status === "added") {
                  return [
                    "",
                    yield* git([...cfg, ...args(["show", `${to}:${row.file}`])]).pipe(Effect.map((item) => item.text)),
                  ]
                }
                if (row.status === "deleted") {
                  return [
                    yield* git([...cfg, ...args(["show", `${from}:${row.file}`])]).pipe(
                      Effect.map((item) => item.text),
                    ),
                    "",
                  ]
                }
                return yield* Effect.all(
                  [
                    git([...cfg, ...args(["show", `${from}:${row.file}`])]).pipe(Effect.map((item) => item.text)),
                    git([...cfg, ...args(["show", `${to}:${row.file}`])]).pipe(Effect.map((item) => item.text)),
                  ],
                  { concurrency: 2 },
                )
              })

              const load = Effect.fnUntraced(
                function* (rows: Row[]) {
                  const refs = rows.flatMap((row) => {
                    if (row.binary) return []
                    if (row.status === "added")
                      return [{ file: row.file, side: "after", ref: `${to}:${row.file}` } satisfies Ref]
                    if (row.status === "deleted") {
                      return [{ file: row.file, side: "before", ref: `${from}:${row.file}` } satisfies Ref]
                    }
                    return [
                      { file: row.file, side: "before", ref: `${from}:${row.file}` } satisfies Ref,
                      { file: row.file, side: "after", ref: `${to}:${row.file}` } satisfies Ref,
                    ]
                  })
                  if (!refs.length) return { map: new Map<string, { before: string; after: string }>(), oversized: new Set<string>() }

                  const skip = new Set<string>()
                  const check = yield* git(
                    [...cfg, ...args(["cat-file", "--batch-check"])],
                    { cwd: state.directory, stdin: refs.map((item) => item.ref).join("\n") + "\n" },
                  )
                  if (check.code === 0) {
                    const lines = check.text.split("\n")
                    let sum = 0
                    for (let idx = 0; idx < refs.length; idx += 1) {
                      const match = lines[idx]?.match(/^[0-9a-f]+ blob (\d+)$/)
                      if (!match) continue
                      const size = Number(match[1])
                      if (size > limit || sum + size > totalLimit) {
                        skip.add(refs[idx].ref)
                        continue
                      }
                      sum += size
                    }
                  }

                  const oversized = new Set(refs.filter((item) => skip.has(item.ref)).map((item) => item.file))
                  const fetch = refs.filter((item) => !skip.has(item.ref))
                  if (!fetch.length) return { map: new Map<string, { before: string; after: string }>(), oversized }

                  const batch = yield* appProcess.run(
                    ChildProcess.make("git", [...cfg, ...args(["cat-file", "--batch"])], {
                      cwd: state.directory,
                      env: GIT_NO_PROMPT_ENV,
                      extendEnv: true,
                    }),
                    { stdin: fetch.map((item) => item.ref).join("\n") + "\n", timeout: GIT_SUBPROCESS_TIMEOUT },
                  )
                  if (batch.exitCode !== 0) {
                    yield* Effect.logInfo(
                      "git cat-file --batch failed during snapshot diff, falling back to per-file git show",
                      {
                        stderr: batch.stderr.toString("utf8"),
                        refs: fetch.length,
                      },
                    )
                    return
                  }
                  const out = batch.stdout

                  const fail = (msg: string, extra?: Record<string, string>) => {
                    return undefined
                  }

                  const map = new Map<string, { before: string; after: string }>()
                  const dec = new TextDecoder()
                  let i = 0
                  for (const ref of fetch) {
                    let end = i
                    while (end < out.length && out[end] !== 10) end += 1
                    if (end >= out.length) {
                      return fail(
                        "git cat-file --batch returned a truncated header during snapshot diff, falling back to per-file git show",
                      )
                    }

                    const head = dec.decode(out.slice(i, end))
                    i = end + 1
                    const hit = map.get(ref.file) ?? { before: "", after: "" }
                    if (head.endsWith(" missing")) {
                      map.set(ref.file, hit)
                      continue
                    }

                    const match = head.match(/^[0-9a-f]+ blob (\d+)$/)
                    if (!match) {
                      return fail(
                        "git cat-file --batch returned an unexpected header during snapshot diff, falling back to per-file git show",
                        { head },
                      )
                    }

                    const size = Number(match[1])
                    if (!Number.isInteger(size) || size < 0 || i + size >= out.length || out[i + size] !== 10) {
                      return fail(
                        "git cat-file --batch returned truncated content during snapshot diff, falling back to per-file git show",
                        { head },
                      )
                    }

                    const text = dec.decode(out.slice(i, i + size))
                    if (ref.side === "before") hit.before = text
                    if (ref.side === "after") hit.after = text
                    map.set(ref.file, hit)
                    i += size + 1
                  }

                  if (i !== out.length) {
                    return fail(
                      "git cat-file --batch returned trailing data during snapshot diff, falling back to per-file git show",
                    )
                  }

                  return { map, oversized }
                },
                Effect.scoped,
                Effect.catch(() =>
                  Effect.succeed<
                    { map: Map<string, { before: string; after: string }>; oversized: Set<string> } | undefined
                  >(undefined),
                ),
              )

              const result: FileDiff[] = []
              const status = new Map<string, "added" | "deleted" | "modified">()

              const statuses = yield* git(
                [...quote, ...args(["diff", "--no-ext-diff", "--name-status", "--no-renames", from, to, "--", "."])],
                { cwd: state.directory },
              )

              for (const line of statuses.text.trim().split("\n")) {
                if (!line) continue
                const [code, file] = line.split("\t")
                if (!code || !file) continue
                status.set(file, code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified")
              }

              const numstat = yield* git(
                [...quote, ...args(["diff", "--no-ext-diff", "--no-renames", "--numstat", from, to, "--", "."])],
                {
                  cwd: state.directory,
                },
              )

              const rows = numstat.text
                .trim()
                .split("\n")
                .filter(Boolean)
                .flatMap((line) => {
                  const [adds, dels, file] = line.split("\t")
                  if (!file) return []
                  const binary = adds === "-" && dels === "-"
                  const additions = binary ? 0 : parseInt(adds)
                  const deletions = binary ? 0 : parseInt(dels)
                  return [
                    {
                      file,
                      status: status.get(file) ?? "modified",
                      binary,
                      additions: Number.isFinite(additions) ? additions : 0,
                      deletions: Number.isFinite(deletions) ? deletions : 0,
                    } satisfies Row,
                  ]
                })

              // Hide ignored-file removals from the user-facing diff output.
              const ignored = yield* ignore(rows.map((r) => r.file))
              if (ignored.size > 0) {
                const filtered = rows.filter((r) => !ignored.has(r.file))
                rows.length = 0
                rows.push(...filtered)
              }

              const step = 100
              const patch = (file: string, before: string, after: string) => {
                if (Buffer.byteLength(before) + Buffer.byteLength(after) > MAX_PATCH_BYTES) return emptyPatch(file)
                return formatPatch(
                  structuredPatch(file, file, before, after, "", "", { context: PATCH_CONTEXT_LINES }),
                )
              }

              if (!withPatch) {
                for (const row of rows) {
                  result.push({
                    file: row.file,
                    additions: row.additions,
                    deletions: row.deletions,
                    status: row.status,
                  })
                }
                return result
              }

              let total = 0
              for (let i = 0; i < rows.length; i += step) {
                const run = rows.slice(i, i + step)
                const loaded = yield* load(run)

                for (const row of run) {
                  const hit = loaded?.map.get(row.file) ?? { before: "", after: "" }
                  const oversized = loaded?.oversized.has(row.file) ?? false
                  const [before, after] = row.binary
                    ? ["", ""]
                    : loaded
                      ? [hit.before, hit.after]
                      : yield* show(row)
                  const computed = row.binary || oversized ? "" : patch(row.file, before, after)
                  total += Buffer.byteLength(computed)
                  const capped = total > MAX_TOTAL_PATCH_BYTES
                  result.push({
                    file: row.file,
                    patch: capped ? emptyPatch(row.file) : computed,
                    additions: row.additions,
                    deletions: row.deletions,
                    status: row.status,
                  })
                }
              }

              return result
            }),
            () => [],
          )
        })

        yield* cleanup().pipe(
          Effect.catchCause((cause) => Effect.logError("cleanup loop failed", { cause: Cause.pretty(cause) })),
          Effect.repeat(Schedule.spaced(Duration.hours(6))),
          Effect.delay(Duration.minutes(1)),
          Effect.forkScoped,
        )

        return { cleanup, enabled, track, patch, restore, revert, diff, diffFull }
      }),
    )

    return Service.of({
      init: Effect.fn("Snapshot.init")(function* () {
        yield* InstanceState.get(state)
      }),
      cleanup: Effect.fn("Snapshot.cleanup")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.cleanup())
      }),
      enabled: Effect.fn("Snapshot.enabled")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.enabled())
      }),
      track: Effect.fn("Snapshot.track")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.track())
      }),
      patch: Effect.fn("Snapshot.patch")(function* (hash: string, toHash?: string) {
        return yield* InstanceState.useEffect(state, (s) => s.patch(hash, toHash))
      }),
      restore: Effect.fn("Snapshot.restore")(function* (snapshot: string) {
        return yield* InstanceState.useEffect(state, (s) => s.restore(snapshot))
      }),
      revert: Effect.fn("Snapshot.revert")(function* (patches: Patch[]) {
        return yield* InstanceState.useEffect(state, (s) => s.revert(patches))
      }),
      diff: Effect.fn("Snapshot.diff")(function* (hash: string) {
        return yield* InstanceState.useEffect(state, (s) => s.diff(hash))
      }),
      diffFull: Effect.fn("Snapshot.diffFull")(function* (from: string, to: string, options?: { patch?: boolean }) {
        return yield* InstanceState.useEffect(state, (s) => s.diffFull(from, to, options))
      }),
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [FSUtil.node, AppProcess.node, Config.node],
})

export * as Snapshot from "."
