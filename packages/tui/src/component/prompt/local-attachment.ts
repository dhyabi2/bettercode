import { readFile, stat } from "node:fs/promises"
import path from "node:path"

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export type LocalFiles = Readonly<{
  readText(path: string): Promise<string>
  readBytes(path: string): Promise<Uint8Array>
  mime(path: string): Promise<string>
  stat(path: string): Promise<{ size: number }>
}>

export type LocalAttachment =
  | Readonly<{ type: "text"; mime: "image/svg+xml"; content: string }>
  | Readonly<{ type: "binary"; mime: string; content: Uint8Array }>
  | Readonly<{ type: "rejected"; reason: "too_large"; size: number }>

export function readLocalAttachment(file: string) {
  return readLocalAttachmentWith(
    {
      readText: (value) => readFile(value, "utf8"),
      readBytes: (value) => readFile(value),
      mime: async (value) => mimeTypes[path.extname(value).toLowerCase()] ?? "application/octet-stream",
      stat: async (value) => stat(value),
    },
    file,
  )
}

const mimeTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
}

export async function readLocalAttachmentWith(files: LocalFiles, path: string): Promise<LocalAttachment | undefined> {
  const mime = await files.mime(path).catch(() => undefined)
  if (!mime) return
  if (mime !== "image/svg+xml" && !mime.startsWith("image/") && mime !== "application/pdf") return
  const info = await files.stat(path).catch(() => undefined)
  if (!info) return
  if (info.size > MAX_ATTACHMENT_BYTES) return { type: "rejected", reason: "too_large", size: info.size }
  if (mime === "image/svg+xml") {
    const content = await files.readText(path).catch(() => undefined)
    if (!content) return
    return { type: "text", mime, content }
  }
  const content = await files.readBytes(path).catch(() => undefined)
  if (!content) return
  return { type: "binary", mime, content }
}
