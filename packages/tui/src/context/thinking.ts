import { createMemo, type Setter } from "solid-js"
import { useKV } from "./kv"

export type ThinkingMode = "show" | "hide"

const MODES: readonly ThinkingMode[] = ["show", "hide"] as const

// OpenAI's Responses API surfaces reasoning summaries that start with a bolded
// title block: "**Inspecting PR workflow**\n\n<body>". Treat that first block,
// or a complete title still awaiting its body while streaming, as disclosure
// metadata so the TUI can style its header independently from the markdown body.
// Bound the title-boundary scan so a still-streaming, unterminated "**title"
// prefix can't force unbounded regex backtracking across the whole
// accumulated string (O(n^2) over a long stream). 512 chars is generous for
// any real title; text without a boundary within the window isn't treated
// as a title block, same as today's no-match behavior.
const TITLE_SCAN_WINDOW = 512

export function reasoningSummary(text: string) {
  const content = text.trim()
  if (!content.startsWith("**")) return { title: null, body: content }

  const window = content.slice(0, TITLE_SCAN_WINDOW)
  const closeIdx = window.indexOf("**", 2)
  if (closeIdx === -1) return { title: null, body: content }

  const titleCandidate = window.slice(2, closeIdx)
  if (titleCandidate.includes("\n")) return { title: null, body: content }

  const afterClose = closeIdx + 2
  const rest = content.slice(afterClose)
  const blankLine = rest.match(/^\r?\n\r?\n/)
  if (blankLine) return { title: titleCandidate.trim(), body: content.slice(afterClose + blankLine[0].length).trimEnd() }
  if (rest.length === 0) return { title: titleCandidate.trim(), body: "" }
  return { title: null, body: content }
}

export function isThinkingMode(value: unknown): value is ThinkingMode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value)
}

// Cycle order matches the slash command: show → hide → show.
export function nextThinkingMode(current: ThinkingMode): ThinkingMode {
  const idx = MODES.indexOf(current)
  return MODES[(idx + 1) % MODES.length] ?? "show"
}

export function useThinkingMode() {
  const kv = useKV()
  // Capture pre-state before `kv.signal` seeds a default, so we can detect
  // first-time users with a legacy `thinking_visibility` boolean and migrate.
  // The KVProvider only renders children once kv.ready, so reads here are safe.
  const hadStored = kv.get("thinking_mode") !== undefined
  const legacy = kv.get("thinking_visibility")
  const [stored, setStored] = kv.signal<ThinkingMode>("thinking_mode", "hide")

  // The kv signal exposes its setter typed as `Setter<T>` which carries Solid's
  // overload set; passing an updater fn through a property access loses the
  // bivariance trick the existing `setX((prev) => ...)` callsites rely on.
  // Wrap it in a sane shape so consumers can just call `set(next)` or pass
  // an updater.
  const set = (next: ThinkingMode | ((prev: ThinkingMode) => ThinkingMode)) => {
    if (typeof next === "function") setStored(next as Setter<ThinkingMode>)
    else setStored(() => next)
  }

  // Preserve previous experience for users who had explicitly toggled the
  // legacy `thinking_visibility` boolean. First-time users (no legacy key)
  // get the new "hide" default (collapsed thinking).
  if (!hadStored) {
    if (legacy === true) set("show")
    else if (legacy === false) set("hide")
  }

  if ((stored() as string) === "minimal") set("hide")

  const mode = createMemo<ThinkingMode>(() => {
    const value = stored()
    return isThinkingMode(value) ? value : "hide"
  })

  return {
    mode,
    set,
  }
}
