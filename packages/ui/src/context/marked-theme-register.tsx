import { registerCustomTheme } from "@pierre/diffs"
import { NanoCodeTheme } from "./marked-theme"

let registered = false

export function registerNanoCodeTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("NanoCode", () => Promise.resolve(NanoCodeTheme))
}
