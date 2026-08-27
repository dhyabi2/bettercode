/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeNanocodeContent from "./skill/customize-nanocode.md" with { type: "text" }

export const CustomizeNanocodeContent = customizeNanocodeContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-nanocode",
            description:
              "Use ONLY when the user is editing or creating nanocode's own configuration: nanocode.json, nanocode.jsonc, files under .nanocode/, or files under ~/.config/nanocode/. Also use when creating or fixing nanocode agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring nanocode itself.",
            location: AbsolutePath.make("/builtin/customize-nanocode.md"),
            content: CustomizeNanocodeContent,
          }),
        }),
      )
    })
  }),
})
