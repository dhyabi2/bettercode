export * as TuiConfig from "./tui"

import path from "path"
import { mergeDeep, unique } from "remeda"
import { AppNodeBuilder } from "@nanocode-ai/core/effect/app-node-builder"
import { LayerNode } from "@nanocode-ai/core/effect/layer-node"
import { Cause, Context, Effect, Fiber, Layer } from "effect"
import { ConfigParse } from "@/config/parse"
import * as ConfigPaths from "@/config/paths"
import { migrateTuiConfig } from "./tui-migrate"
import { resolveHostAttentionSoundPaths } from "./tui-host-attention"
import { Flag } from "@nanocode-ai/core/flag/flag"
import { isRecord } from "@nanocode-ai/tui/util/record"
import { Global } from "@nanocode-ai/core/global"
import { FSUtil } from "@nanocode-ai/core/fs-util"
import { CurrentWorkingDirectory } from "./tui-cwd"
import { ConfigPlugin } from "@/config/plugin"
import { TuiKeybind } from "@nanocode-ai/tui/config/keybind"
import { InstallationLocal, InstallationVersion } from "@nanocode-ai/core/installation/version"
import { makeRuntime } from "@nanocode-ai/core/effect/runtime"
import { Filesystem } from "@/util/filesystem"
import { ConfigVariable } from "@/config/variable"
import { Npm } from "@nanocode-ai/core/npm"
import { FormatError, FormatUnknownError } from "@/cli/error"
import { TuiConfig } from "@nanocode-ai/tui/config"

export const Info = TuiConfig.Info
export type Info = TuiConfig.Info

type Acc = {
  result: Info
  plugin_origins: ConfigPlugin.Origin[]
  warnings: ConfigWarning[]
}

export type ConfigWarning = { path: string; reason: string; keys?: string[] }

export type Resolved = TuiConfig.Resolved

export type HostMetadata = {
  plugin_origins?: ConfigPlugin.Origin[]
}

export interface Interface {
  readonly get: () => Effect.Effect<Resolved>
  readonly pluginOrigins: () => Effect.Effect<ConfigPlugin.Origin[]>
  readonly warnings: () => Effect.Effect<ConfigWarning[]>
  readonly waitForDependencies: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@nanocode/TuiConfig") {}

function pluginScope(file: string, ctx: { directory: string }): ConfigPlugin.Scope {
  if (Filesystem.contains(ctx.directory, file)) return "local"
  // if (ctx.worktree !== "/" && Filesystem.contains(ctx.worktree, file)) return "local"
  return "global"
}

function normalize(raw: Record<string, unknown>) {
  const data = { ...raw }
  if (!("tui" in data)) return data
  if (!isRecord(data.tui)) {
    delete data.tui
    return data
  }

  const tui = data.tui
  delete data.tui
  return {
    ...tui,
    ...data,
  }
}

function dropUnknownKeybinds(input: Record<string, unknown>): { input: Record<string, unknown>; dropped: string[] } {
  if (!isRecord(input.keybinds)) return { input, dropped: [] }

  const invalid = TuiKeybind.unknownKeys(input.keybinds)
  if (!invalid.length) return { input, dropped: [] }

  return {
    input: {
      ...input,
      keybinds: Object.fromEntries(Object.entries(input.keybinds).filter(([key]) => !invalid.includes(key))),
    },
    dropped: invalid,
  }
}

const loadState = Effect.fn("TuiConfig.loadState")(function* (ctx: { directory: string }) {
  const afs = yield* FSUtil.Service
  let appliedOrder = 0

  const resolvePlugins = (config: Info, configFilepath: string): Effect.Effect<Info> =>
    Effect.gen(function* () {
      const plugins = config.plugin
      if (!plugins) return config
      return {
        ...config,
        plugin: yield* Effect.forEach(plugins, (plugin) =>
          Effect.promise(() => ConfigPlugin.resolvePluginSpec(plugin as ConfigPlugin.Origin["spec"], configFilepath)),
        ),
      }
    })

  const load = (text: string, configFilepath: string): Effect.Effect<{ info: Info; warning?: ConfigWarning }> =>
    Effect.gen(function* () {
      const expanded = yield* Effect.promise(() =>
        ConfigVariable.substitute({ text, type: "path", path: configFilepath, missing: "empty" }),
      )
      const data = ConfigParse.jsonc(expanded, configFilepath, text)
      if (!isRecord(data)) return { info: {} as Info }
      // Flatten a nested "tui" key so users who wrote `{ "tui": { ... } }` inside tui.json
      // (mirroring the old nanocode.json shape) still get their settings applied.
      const { input: normalized, dropped } = dropUnknownKeybinds(normalize(data))
      const parsed = ConfigParse.schema(Info, normalized, configFilepath)
      const validated = parsed.attention?.sounds
        ? {
            ...parsed,
            attention: {
              ...parsed.attention,
              sounds: resolveHostAttentionSoundPaths(path.dirname(configFilepath), parsed.attention.sounds),
            },
          }
        : parsed
      const info = yield* resolvePlugins(validated, configFilepath)
      if (!dropped.length) return { info }
      const reason = "unknown keybind(s): " + dropped.join(", ")
      yield* Effect.logWarning("skipping invalid tui config", { path: configFilepath, reason })
      return { info, warning: { path: configFilepath, reason, keys: dropped } }
    }).pipe(
      // catchCause (not tapErrorCause + orElseSucceed) because JSONC parsing and validation
      // can sync-throw — those become defects, which orElseSucceed wouldn't catch.
      Effect.catchCause((cause) => {
        const reason = FormatError(Cause.squash(cause)) ?? FormatUnknownError(Cause.squash(cause))
        return Effect.logWarning("skipping invalid tui config", {
          path: configFilepath,
          reason,
        }).pipe(Effect.as({ info: {} as Info, warning: { path: configFilepath, reason } }))
      }),
    )

  const loadFile = (filepath: string): Effect.Effect<{ info: Info; warning?: ConfigWarning }> =>
    Effect.gen(function* () {
      // Silent-swallow non-NotFound read errors (perms, EISDIR, IO) → log + skip.
      // Matches how parse/schema/plugin failures in load() are handled — every
      // broken-config path degrades gracefully rather than crashing TUI startup.
      const text = yield* afs.readFileStringSafe(filepath).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("failed to read tui config", {
            path: filepath,
            reason: FormatError(Cause.squash(cause)) ?? FormatUnknownError(Cause.squash(cause)),
          }).pipe(Effect.as(undefined)),
        ),
      )
      if (!text) return { info: {} as Info }
      yield* Effect.logInfo("loading tui config", { path: filepath })
      return yield* load(text, filepath)
    })

  const mergeFile = (acc: Acc, file: string) =>
    Effect.gen(function* () {
      const { info: data, warning } = yield* loadFile(file)
      if (warning) acc.warnings.push(warning)
      if (Object.keys(data).length) {
        appliedOrder += 1
        yield* Effect.logInfo("applying tui config", { path: file, order: appliedOrder })
      }
      acc.result = mergeDeep(acc.result, data)
      if (!data.plugin?.length) return

      const scope = pluginScope(file, ctx)
      const plugins = ConfigPlugin.deduplicatePluginOrigins([
        ...acc.plugin_origins,
        ...data.plugin.map((spec) => ({ spec: spec as ConfigPlugin.Origin["spec"], scope, source: file })),
      ])
      acc.result = {
        ...acc.result,
        plugin: plugins.map((item) => item.spec),
      }
      acc.plugin_origins = plugins
    })

  // Every config dir we may read from: global config dir, any `.nanocode`
  // folders between cwd and home, and NANOCODE_CONFIG_DIR.
  const directories = yield* ConfigPaths.directories(ctx.directory)
  yield* Effect.promise(() => migrateTuiConfig({ directories, cwd: ctx.directory }))

  const projectFiles = Flag.NANOCODE_DISABLE_PROJECT_CONFIG ? [] : yield* ConfigPaths.files("tui", ctx.directory)

  const acc: Acc = {
    result: {},
    plugin_origins: [],
    warnings: [],
  }

  // 1. Global tui config (lowest precedence).
  for (const file of ConfigPaths.fileInDirectory(Global.Path.config, "tui")) {
    yield* mergeFile(acc, file)
  }

  // 2. Explicit NANOCODE_TUI_CONFIG override, if set.
  if (Flag.NANOCODE_TUI_CONFIG) {
    const configFile = Flag.NANOCODE_TUI_CONFIG
    yield* mergeFile(acc, configFile)
    yield* Effect.logDebug("loaded custom tui config", { path: configFile })
  }

  // 3. Project tui files, applied root-first so the closest file wins.
  for (const file of projectFiles) {
    yield* mergeFile(acc, file)
  }

  // 4. `.nanocode` directories (and NANOCODE_CONFIG_DIR) discovered while
  // walking up the tree. Also returned below so callers can install plugin
  // dependencies from each location.
  const dirs = unique(directories).filter((dir) => dir.endsWith(".nanocode") || dir === Flag.NANOCODE_CONFIG_DIR)

  for (const dir of dirs) {
    if (!dir.endsWith(".nanocode") && dir !== Flag.NANOCODE_CONFIG_DIR) continue
    for (const file of ConfigPaths.fileInDirectory(dir, "tui")) {
      yield* mergeFile(acc, file)
    }
  }

  const result = TuiConfig.resolve(
    {
      ...acc.result,
    },
    {
      terminalSuspend: process.platform !== "win32",
    },
  )

  return {
    config: result,
    pluginOrigins: acc.plugin_origins,
    warnings: acc.warnings,
    dirs: result.plugin?.length ? dirs : [],
  }
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const directory = yield* CurrentWorkingDirectory
    const npm = yield* Npm.Service
    const data = yield* loadState({ directory })
    const deps = yield* Effect.forEach(
      data.dirs,
      (dir) =>
        npm
          .install(dir, {
            add: [
              {
                name: "@nanocode-ai/plugin",
                version: InstallationLocal ? undefined : InstallationVersion,
              },
            ],
          })
          .pipe(Effect.forkScoped),
      {
        concurrency: "unbounded",
      },
    )

    const get = Effect.fn("TuiConfig.get")(() => Effect.succeed(data.config))
    const pluginOrigins = Effect.fn("TuiConfig.pluginOrigins")(() => Effect.succeed(data.pluginOrigins))
    const warnings = Effect.fn("TuiConfig.warnings")(() => Effect.succeed(data.warnings))

    const waitForDependencies = Effect.fn("TuiConfig.waitForDependencies")(() =>
      Effect.forEach(deps, Fiber.join, { concurrency: "unbounded" }).pipe(Effect.ignore(), Effect.asVoid),
    )
    return Service.of({ get, pluginOrigins, warnings, waitForDependencies })
  }).pipe(Effect.withSpan("TuiConfig.layer")),
)

export const node = LayerNode.make({ service: Service, layer, deps: [Npm.node, FSUtil.node] })

const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export async function waitForDependencies() {
  await runPromise((svc) => svc.waitForDependencies())
}

export async function get() {
  return runPromise((svc) => svc.get())
}

export async function pluginOrigins() {
  return runPromise((svc) => svc.pluginOrigins())
}

export async function warnings() {
  return runPromise((svc) => svc.warnings())
}
