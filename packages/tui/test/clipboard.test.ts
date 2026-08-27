import { expect, test } from "bun:test"
import { copyCommand } from "../src/clipboard"

test("prefers Wayland clipboard when available", () => {
  expect(copyCommand("linux", true, (name) => name === "wl-copy")).toEqual(["wl-copy"])
})

// ux-responsiveness-clipboard-osascript-argv-size-limit replaced the AppleScript string literal
// with a stdin pipe to pbcopy, so macOS detection probes for pbcopy itself rather than osascript.
test("uses pbcopy on macOS", () => {
  expect(copyCommand("darwin", false, (name) => name === "pbcopy")).toEqual(["pbcopy"])
  expect(copyCommand("darwin", false, (name) => name === "osascript")).toBeUndefined()
})

test("falls back through X11 clipboard commands", () => {
  expect(copyCommand("linux", true, (name) => name === "xclip")).toEqual(["xclip", "-selection", "clipboard"])
  expect(copyCommand("linux", false, (name) => name === "xsel")).toEqual(["xsel", "--clipboard", "--input"])
})

test("returns undefined when native clipboard is unavailable", () => {
  expect(copyCommand("linux", false, () => false)).toBeUndefined()
})
