import { run as runTui, type TuiInput } from "@bettercode-ai/tui"
import { Global } from "@bettercode-ai/core/global"
import { AppNodeBuilder } from "@bettercode-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
