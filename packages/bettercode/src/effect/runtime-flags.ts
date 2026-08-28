import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("BETTERCODE_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@bettercode/RuntimeFlags", {
  autoShare: bool("BETTERCODE_AUTO_SHARE"),
  pure: bool("BETTERCODE_PURE"),
  disableDefaultPlugins: bool("BETTERCODE_DISABLE_DEFAULT_PLUGINS"),
  disableEmbeddedWebUi: bool("BETTERCODE_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("BETTERCODE_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("BETTERCODE_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("BETTERCODE_DISABLE_CLAUDE_CODE"),
    direct: bool("BETTERCODE_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("BETTERCODE_DISABLE_CLAUDE_CODE"),
    direct: bool("BETTERCODE_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("BETTERCODE_ENABLE_EXA"),
    legacy: bool("BETTERCODE_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("BETTERCODE_ENABLE_PARALLEL"),
    legacy: bool("BETTERCODE_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("BETTERCODE_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("BETTERCODE_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("BETTERCODE_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: enabledByExperimental("BETTERCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("BETTERCODE_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("BETTERCODE_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("BETTERCODE_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("BETTERCODE_EXPERIMENTAL_PLAN_MODE"),
  experimentalCodeMode: enabledByExperimental("BETTERCODE_EXPERIMENTAL_CODE_MODE"),
  experimentalEventSystem: enabledByExperimental("BETTERCODE_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("BETTERCODE_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("BETTERCODE_EXPERIMENTAL_ICON_DISCOVERY"),
  // Overrides the default output-token ceiling applied to catalog-sourced
  // limits only; a model with an explicitly configured `limit.output` is
  // authoritative and ignores this flag.
  outputTokenMax: positiveInteger("BETTERCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("BETTERCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("BETTERCODE_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("BETTERCODE_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("BETTERCODE_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const node = LayerNode.make({ service: Service, layer: Service.layer.pipe(Layer.orDie), deps: [] })

export * as RuntimeFlags from "./runtime-flags"
import { LayerNode } from "@bettercode-ai/core/effect/layer-node"
