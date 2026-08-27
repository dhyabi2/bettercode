import { expect, test } from "bun:test"
import { SessionCompaction } from "@nanocode-ai/core/session/compaction"

test("compaction user prompt preserves conversation and prior summary framing", () => {
  const user = SessionCompaction.buildCompactionUser({ context: ["conversation history"] })

  expect(user).toBe("Here is the conversation so far:\n\n<conversation>\nconversation history\n</conversation>")

  const withSummary = SessionCompaction.buildCompactionUser({
    context: ["new conversation"],
    previousSummary: "existing summary",
  })
  expect(withSummary.indexOf("<conversation>")).toBeLessThan(withSummary.indexOf("<prior-summary>"))
  expect(withSummary).toContain("<prior-summary>\nexisting summary\n</prior-summary>")
})

test("compaction system prompt preserves detailed work state and relevant files", () => {
  const system = SessionCompaction.buildCompactionSystem(false)

  expect(system).toContain("Create a new anchored summary from the conversation history in the <conversation> tags above")
  expect(system).toContain("## Work State\n### Completed")
  expect(system).toContain("### Active")
  expect(system).toContain("### Blocked")
  expect(system).toContain("## Relevant Files")
})

test("compaction system prompt gives update instructions for a prior summary", () => {
  const system = SessionCompaction.buildCompactionSystem(true)

  expect(system.indexOf("The <prior-summary> summarizes")).toBeLessThan(system.indexOf("## Work State"))
  expect(system).toContain(
    "Carry forward objectives, constraints, user directives, decisions, and parallel workstreams from the <prior-summary>",
  )
  expect(system).toContain('Move completed work from "Active" to "Completed".')
  expect(system).toContain('Update "Objective" and "Next Move" to reflect the current work state.')
})

test("compaction system prompt is byte-identical regardless of conversation content", () => {
  expect(SessionCompaction.buildCompactionSystem(false)).toBe(SessionCompaction.buildCompactionSystem(false))
  expect(SessionCompaction.buildCompactionSystem(true)).toBe(SessionCompaction.buildCompactionSystem(true))
})

test("compaction describes tool media without embedding base64", () => {
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
  const serialized = SessionCompaction.serializeToolContent([
    { type: "text", text: "Image read successfully" },
    {
      type: "file",
      uri: `data:image/png;base64,${base64}`,
      mime: "image/png",
      name: "pixel.png",
    },
  ])

  expect(serialized).toBe("Image read successfully\n[Attached image/png: pixel.png]")
  expect(serialized).not.toContain(base64)
})
