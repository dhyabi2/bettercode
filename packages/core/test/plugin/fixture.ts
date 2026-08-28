import { AgentV2 } from "@bettercode-ai/core/agent"
import { AISDK } from "@bettercode-ai/core/aisdk"
import { Catalog } from "@bettercode-ai/core/catalog"
import { CommandV2 } from "@bettercode-ai/core/command"
import { Credential } from "@bettercode-ai/core/credential"
import { AppNodeBuilder } from "@bettercode-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@bettercode-ai/core/effect/app-node-platform"
import { LayerNode } from "@bettercode-ai/core/effect/layer-node"
import { EventV2 } from "@bettercode-ai/core/event"
import { FileSystem } from "@bettercode-ai/core/filesystem"
import { FSUtil } from "@bettercode-ai/core/fs-util"
import { Integration } from "@bettercode-ai/core/integration"
import { Location } from "@bettercode-ai/core/location"
import { Npm } from "@bettercode-ai/core/npm"
import { PluginV2 } from "@bettercode-ai/core/plugin"
import { Reference } from "@bettercode-ai/core/reference"
import { SkillV2 } from "@bettercode-ai/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
