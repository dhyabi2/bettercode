import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Catalog } from "@bettercode-ai/core/catalog"
import { Integration } from "@bettercode-ai/core/integration"
import { PluginV2 } from "@bettercode-ai/core/plugin"
import { PluginHost } from "@bettercode-ai/core/plugin/host"
import { ProviderPlugins } from "@bettercode-ai/core/plugin/provider"
import { LLMGatewayPlugin } from "@bettercode-ai/core/plugin/provider/llmgateway"
import { ProviderV2 } from "@bettercode-ai/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

const addPlugin = Effect.fn(function* () {
  const plugin = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugin)
  const integration = yield* Integration.Service
  yield* LLMGatewayPlugin.effect(host).pipe(Effect.provideService(Integration.Service, integration))
})

describe("LLMGatewayPlugin", () => {
  it.effect("is registered so legacy referer headers can be applied", () =>
    Effect.sync(() => expect(ProviderPlugins.map((item) => item.id)).toContain(PluginV2.ID.make("llmgateway"))),
  )

  it.effect("applies legacy referer headers only to enabled llmgateway", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const integrations = yield* Integration.Service
      yield* integrations.transform((editor) => {
        editor.update(Integration.ID.make("llmgateway"), () => {})
        editor.update(Integration.ID.make("openrouter"), () => {})
      })
      yield* catalog.transform((catalog) => {
        catalog.provider.update(ProviderV2.ID.make("llmgateway"), (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.llmgateway.io/v1",
          }
          provider.request = { headers: { Existing: "value" }, body: {} }
        })
        catalog.provider.update(ProviderV2.ID.openrouter, () => {})
      })
      yield* addPlugin()
      expect((yield* catalog.provider.get(ProviderV2.ID.make("llmgateway")))?.request.headers).toEqual({
        Existing: "value",
        "HTTP-Referer": "https://bettercode.ai/",
        "X-Title": "bettercode",
        "X-Source": "bettercode",
      })
      expect((yield* catalog.provider.get(ProviderV2.ID.openrouter))?.request.headers).toEqual({})
    }),
  )

  it.effect("does not apply legacy headers to a disabled llmgateway provider", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const integrations = yield* Integration.Service
      yield* integrations.transform((editor) => {
        editor.update(Integration.ID.make("llmgateway"), () => {})
      })
      yield* catalog.transform((catalog) => {
        catalog.provider.update(ProviderV2.ID.make("llmgateway"), (provider) => {
          provider.disabled = true
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.llmgateway.io/v1",
          }
        })
      })
      yield* addPlugin()

      expect((yield* catalog.provider.get(ProviderV2.ID.make("llmgateway")))?.disabled).toBe(true)
      expect((yield* catalog.provider.get(ProviderV2.ID.make("llmgateway")))?.request.headers).toEqual({})
    }),
  )
})
