import { describe, expect, test } from "bun:test"
import { MAX_ATTACHMENT_BYTES, readLocalAttachmentWith } from "../../src/component/prompt/local-attachment"
import type { LocalFiles } from "../../src/component/prompt/local-attachment"

function files(input: { mime: string; text?: string; bytes?: Uint8Array; size?: number }): LocalFiles {
  return {
    mime: async () => input.mime,
    readText: async () => input.text ?? "",
    readBytes: async () => input.bytes ?? new Uint8Array(),
    stat: async () => ({ size: input.size ?? 0 }),
  }
}

describe("prompt local attachments", () => {
  test("reads SVG attachments as text", async () => {
    expect(await readLocalAttachmentWith(files({ mime: "image/svg+xml", text: "<svg />" }), "/tmp/image.svg")).toEqual({
      type: "text",
      mime: "image/svg+xml",
      content: "<svg />",
    })
  })

  test("reads image and PDF attachments as bytes", async () => {
    const content = new Uint8Array([1, 2, 3])
    expect(await readLocalAttachmentWith(files({ mime: "application/pdf", bytes: content }), "/tmp/file.pdf")).toEqual({
      type: "binary",
      mime: "application/pdf",
      content,
    })
  })

  test("ignores unsupported and unreadable local files", async () => {
    expect(await readLocalAttachmentWith(files({ mime: "text/plain" }), "/tmp/file.txt")).toBeUndefined()
    expect(
      await readLocalAttachmentWith(
        {
          ...files({ mime: "image/png" }),
          readBytes: async () => Promise.reject(new Error("missing")),
        },
        "/tmp/missing.png",
      ),
    ).toBeUndefined()
  })

  test("rejects files over the size cap without reading their content", async () => {
    let readBytesCalled = false
    const result = await readLocalAttachmentWith(
      {
        ...files({ mime: "image/png", size: MAX_ATTACHMENT_BYTES + 1 }),
        readBytes: async () => {
          readBytesCalled = true
          return new Uint8Array()
        },
      },
      "/tmp/huge.png",
    )
    expect(result).toEqual({ type: "rejected", reason: "too_large", size: MAX_ATTACHMENT_BYTES + 1 })
    expect(readBytesCalled).toBe(false)
  })

  test("rejects an oversized SVG without reading its content", async () => {
    let readTextCalled = false
    const result = await readLocalAttachmentWith(
      {
        ...files({ mime: "image/svg+xml", size: MAX_ATTACHMENT_BYTES + 1 }),
        readText: async () => {
          readTextCalled = true
          return ""
        },
      },
      "/tmp/huge.svg",
    )
    expect(result).toEqual({ type: "rejected", reason: "too_large", size: MAX_ATTACHMENT_BYTES + 1 })
    expect(readTextCalled).toBe(false)
  })
})
