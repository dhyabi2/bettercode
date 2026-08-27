import { run as runTui, type TuiInput } from "@nanocode-ai/tui"
import { Global } from "@nanocode-ai/core/global"
import { AppNodeBuilder } from "@nanocode-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
