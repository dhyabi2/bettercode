export * as FileSystemSearch from "./search"

import { makeLocationNode } from "../effect/app-node"
import os from "os"
import path from "path"
import { Context, Effect, Layer, Scope, Stream } from "effect"
import { Fff } from "#fff"
import fuzzysort from "fuzzysort"
import { FileSystem } from "../filesystem"
import { FSUtil } from "../fs-util"
import { Location } from "../location"
import { Ripgrep } from "../ripgrep"
import { RelativePath } from "../schema"
import { Flag } from "../flag/flag"
import { EventV2 } from "../event"
import { FileSystemWatcher } from "@bettercode-ai/schema/filesystem-watcher"

export interface Interface {
  readonly find: (input: FileSystem.FindInput) => Effect.Effect<FileSystem.Entry[]>
  readonly glob: (input: FileSystem.GlobInput) => Effect.Effect<readonly FileSystem.Entry[]>
  readonly grep: (input: FileSystem.GrepInput) => Effect.Effect<readonly FileSystem.Match[]>
}

export class Service extends Context.Service<Service, Interface>()("@bettercode/v2/FileSystem/Search") {}

const SCAN_LIMIT = 500_000

const isDangerousRoot = (directory: string) => {
  const resolved = path.resolve(directory).replace(new RegExp(`${path.sep}+$`), "")
  const home = path.resolve(os.homedir()).replace(new RegExp(`${path.sep}+$`), "")
  return resolved === home
}

const makeRipgrepService = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const location = yield* Location.Service
  const ripgrep = yield* Ripgrep.Service
  const scope = yield* Scope.Scope
  const events = yield* EventV2.Service
  const state = {
    files: [] as string[],
    directories: [] as string[],
  }
  const files = new Set<string>()
  const directories = new Set<string>()
  let directoriesVersion = 0
  let materializedDirectoriesVersion = -1
  const syncDirectories = () => {
    if (materializedDirectoriesVersion !== directoriesVersion) {
      state.directories = Array.from(directories)
      materializedDirectoriesVersion = directoriesVersion
    }
  }
  const addPath = (relative: string) => {
    if (files.has(relative)) return
    files.add(relative)
    state.files.push(relative)
    const parts = relative.split("/")
    parts.slice(0, -1).forEach((_, index) => {
      const dir = parts.slice(0, index + 1).join("/") + path.sep
      if (!directories.has(dir)) {
        directories.add(dir)
        directoriesVersion++
      }
    })
  }
  const removePath = (relative: string) => {
    if (!files.delete(relative)) return
    const index = state.files.indexOf(relative)
    if (index !== -1) state.files.splice(index, 1)
  }
  const toRelative = (absolute: string) => {
    const relative = path.relative(location.directory, absolute).split(path.sep).join("/")
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return
    return relative
  }
  yield* ripgrep
    .find({
      cwd: location.directory,
      pattern: "*",
      limit: SCAN_LIMIT,
      onEntry: (entry) => Effect.sync(() => addPath(entry.path)),
    })
    .pipe(
      Effect.tap(() =>
        state.files.length >= SCAN_LIMIT
          ? Effect.logWarning("file index scan truncated at limit", { limit: SCAN_LIMIT })
          : Effect.void,
      ),
      Effect.orDie,
      Effect.asVoid,
      Effect.forkIn(scope),
    )
  yield* events.subscribe(FileSystemWatcher.Event.BatchUpdated).pipe(
    Stream.runForEach((payload) =>
      Effect.sync(() => {
        for (const item of payload.data.files) {
          const relative = toRelative(item.file)
          if (!relative) continue
          if (item.event === "unlink") removePath(relative)
          if (item.event === "add") addPath(relative)
        }
      }),
    ),
    Effect.forkIn(scope),
  )
  return Service.of({
    glob: (input) =>
      Effect.gen(function* () {
        const target = path.resolve(location.directory, input.path ?? ".")
        const info = yield* fs.stat(target).pipe(Effect.orDie)
        const cwd = info.type === "File" ? path.dirname(target) : target
        return yield* ripgrep
          .glob({
            cwd,
            pattern: input.pattern,
            limit: input.limit ?? Number.MAX_SAFE_INTEGER,
          })
          .pipe(
            Effect.map((result) =>
              result.map((entry) =>
                FileSystem.Entry.make({
                  ...entry,
                  path: RelativePath.make(path.relative(location.directory, path.resolve(cwd, entry.path))),
                }),
              ),
            ),
            Effect.orDie,
          )
      }),
    grep: (input) =>
      Effect.gen(function* () {
        const target = path.resolve(location.directory, input.path ?? ".")
        const info = yield* fs.stat(target).pipe(Effect.orDie)
        const cwd = info.type === "File" ? path.dirname(target) : target
        return yield* ripgrep
          .grep({
            cwd,
            pattern: input.pattern,
            file: info.type === "File" ? path.basename(target) : undefined,
            include: input.include,
            limit: input.limit ?? Number.MAX_SAFE_INTEGER,
          })
          .pipe(
            Effect.map((result) =>
              result.map((match) =>
                FileSystem.Match.make({
                  ...match,
                  entry: FileSystem.Entry.make({
                    ...match.entry,
                    path: RelativePath.make(path.relative(location.directory, path.resolve(cwd, match.entry.path))),
                  }),
                }),
              ),
            ),
            Effect.orDie,
          )
      }),
    find: (input) =>
      Effect.gen(function* () {
        if (input.type !== "file") syncDirectories()
        const items =
          input.type === "file"
            ? state.files
            : input.type === "directory"
              ? state.directories
              : [...state.files, ...state.directories]
        return fuzzysort.go(input.query, items, { limit: input.limit ?? 50 }).map((item) => {
          const relative = item.target
          const type = relative.endsWith(path.sep) ? ("directory" as const) : ("file" as const)
          return FileSystem.Entry.make({
            path: RelativePath.make(relative),
            type,
          })
        })
      }),
  })
})

export const ripgrepLayer = Layer.effect(Service, makeRipgrepService)

export const fffLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    if (isDangerousRoot(location.directory)) {
      yield* Effect.logWarning("skipping fff full-content index for oversized root, falling back to ripgrep", {
        directory: location.directory,
      })
      return yield* makeRipgrepService
    }
    const result = yield* Effect.try({
      try: () =>
        Fff.create({
          basePath: location.directory,
          aiMode: true,
          disableMmapCache: true,
          disableContentIndexing: true,
        }),
      catch: (cause) => cause,
    }).pipe(
      Effect.catch((error) => Effect.logWarning("failed to initialize fff", { error }).pipe(Effect.as(undefined))),
    )
    if (!result?.ok) {
      if (result) yield* Effect.logWarning("failed to initialize fff", { error: result.error })
      return Service.of({
        find: () => Effect.succeed([]),
        glob: () => Effect.succeed([]),
        grep: () => Effect.succeed([]),
      })
    }
    yield* Effect.addFinalizer(() => Effect.sync(() => result.value.destroy()).pipe(Effect.ignore))
    return Service.of({
      glob: (input) =>
        Effect.sync(() => {
          const prefix = input.path?.replaceAll("\\", "/").replace(/\/$/, "")
          const found = result.value.glob(prefix ? `${prefix}/${input.pattern}` : input.pattern, {
            pageIndex: 0,
            pageSize: input.limit,
          })
          if (!found.ok) throw found.error
          return found.value.items.map((item) =>
            FileSystem.Entry.make({
              path: RelativePath.make(item.relativePath.replaceAll("\\", "/")),
              type: "file",
            }),
          )
        }),
      grep: (input) =>
        Effect.sync(() => {
          const prefix = input.path?.replaceAll("\\", "/").replace(/\/$/, "")
          const found = result.value.grep(
            [prefix ? `${prefix}/**` : undefined, input.include, input.pattern]
              .filter((value) => value !== undefined)
              .join(" "),
            { mode: "regex", pageSize: input.limit, timeBudgetMs: 1_500 },
          )
          if (!found.ok) throw found.error
          return found.value.items.map((match) => {
            const bytes = Buffer.from(match.lineContent)
            return FileSystem.Match.make({
              entry: FileSystem.Entry.make({
                path: RelativePath.make(match.relativePath.replaceAll("\\", "/")),
                type: "file",
              }),
              line: match.lineNumber,
              offset: match.byteOffset,
              text: match.lineContent.length > 2_000 ? match.lineContent.slice(0, 2_000) + "..." : match.lineContent,
              submatches: match.matchRanges.map(([start, end]) => ({
                text: bytes.subarray(start, end).toString("utf8"),
                start,
                end,
              })),
            })
          })
        }),
      find: (input) =>
        Effect.sync(() => {
          const options = { pageIndex: 0, pageSize: input.limit ?? 50 }
          const items = (() => {
            if (input.type === "file") {
              const found = result.value.fileSearch(input.query.trim(), options)
              if (!found.ok) throw found.error
              return found.value.items.map((item, index) => ({
                path: item.relativePath,
                type: "file" as const,
                score: found.value.scores[index]?.total ?? 0,
              }))
            }
            if (input.type === "directory") {
              const found = result.value.directorySearch(input.query.trim(), options)
              if (!found.ok) throw found.error
              return found.value.items.map((item, index) => ({
                path: item.relativePath,
                type: "directory" as const,
                score: found.value.scores[index]?.total ?? 0,
              }))
            }
            const found = result.value.mixedSearch(input.query.trim(), options)
            if (!found.ok) throw found.error
            return found.value.items.map((item, index) => ({
              path: item.item.relativePath,
              type: item.type,
              score: found.value.scores[index]?.total ?? 0,
            }))
          })()
          return items
            .sort((a, b) => b.score - a.score || a.path.length - b.path.length)
            .map((item) => {
              const relative = item.path.replaceAll("\\", "/").replace(/\/$/, "")
              return FileSystem.Entry.make({
                path: RelativePath.make(relative + (item.type === "directory" ? path.sep : "")),
                type: item.type,
              })
            })
        }),
    })
  }),
)

const layer = Layer.unwrap(Effect.sync(() => (Flag.BETTERCODE_DISABLE_FFF || !Fff.available() ? ripgrepLayer : fffLayer)))

export const locationLayer = layer

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Location.node, Ripgrep.node, EventV2.node],
})
