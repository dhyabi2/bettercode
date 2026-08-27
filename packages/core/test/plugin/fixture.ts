import { AgentV2 } from "@nanocode-ai/core/agent"
import { AISDK } from "@nanocode-ai/core/aisdk"
import { Catalog } from "@nanocode-ai/core/catalog"
import { CommandV2 } from "@nanocode-ai/core/command"
import { Credential } from "@nanocode-ai/core/credential"
import { AppNodeBuilder } from "@nanocode-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@nanocode-ai/core/effect/app-node-platform"
import { LayerNode } from "@nanocode-ai/core/effect/layer-node"
import { EventV2 } from "@nanocode-ai/core/event"
import { FileSystem } from "@nanocode-ai/core/filesystem"
import { FSUtil } from "@nanocode-ai/core/fs-util"
import { Integration } from "@nanocode-ai/core/integration"
import { Location } from "@nanocode-ai/core/location"
import { Npm } from "@nanocode-ai/core/npm"
import { PluginV2 } from "@nanocode-ai/core/plugin"
import { Reference } from "@nanocode-ai/core/reference"
import { SkillV2 } from "@nanocode-ai/core/skill"
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
