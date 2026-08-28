import { registerCustomTheme } from "@pierre/diffs"
import { BetterCodeTheme } from "./marked-theme"

let registered = false

export function registerBetterCodeTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("BetterCode", () => Promise.resolve(BetterCodeTheme))
}
