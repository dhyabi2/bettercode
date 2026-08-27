import { execFile, spawn } from "node:child_process"
import { readFile, rm } from "node:fs/promises"
import { platform, release, tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)

const IDLE_MS = 2000
const HARD_LIMIT_MS = 10000

function command(command: string, args: string[] = [], input?: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] })
    const output: Buffer[] = []
    const stderr: Buffer[] = []
    const start = Date.now()
    let lastActivity = start
    let settled = false
    const watchdog = setInterval(() => {
      if (settled) return
      const now = Date.now()
      if (now - lastActivity > IDLE_MS || now - start > HARD_LIMIT_MS) {
        settled = true
        clearInterval(watchdog)
        child.kill("SIGKILL")
        reject(
          new Error(
            `${command} timed out (${now - lastActivity > IDLE_MS ? "idle" : "hard limit"})`,
          ),
        )
      }
    }, 250)
    child.on("error", (err) => {
      if (settled) return
      settled = true
      clearInterval(watchdog)
      reject(err)
    })
    child.stdout?.on("data", (chunk: Buffer) => {
      lastActivity = Date.now()
      output.push(chunk)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      lastActivity = Date.now()
      stderr.push(chunk)
    })
    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearInterval(watchdog)
      if (code === 0) return resolve(Buffer.concat(output))
      const stderrText = Buffer.concat(stderr).toString().trim()
      reject(new Error(`${command} exited with code ${code}${stderrText ? `: ${stderrText}` : ""}`))
    })
    if (input !== undefined) child.stdin?.end(input)
  })
}

const MAX_OSC52_BYTES = 74 * 1024
const SCREEN_DCS_CHUNK_SIZE = 768 - "\x1bPtmux;\x1b\x1b]52;c;\x07\x1b\\".length

export function chunk(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

function writeOsc52(text: string) {
  if (!process.stdout.isTTY) return
  const b64 = Buffer.from(text).toString("base64")
  if (b64.length > MAX_OSC52_BYTES) return
  if (process.env.STY) {
    for (const piece of chunk(b64, SCREEN_DCS_CHUNK_SIZE)) {
      process.stdout.write(`\x1bPtmux;\x1b\x1b]52;c;${piece}\x07\x1b\\`)
    }
    return
  }
  const sequence = `\x1b]52;c;${b64}\x07`
  if (process.env.TMUX) {
    process.stdout.write(`\x1bPtmux;\x1b${sequence}\x1b\\`)
    return
  }
  process.stdout.write(sequence)
}

export async function read() {
  if (platform() === "darwin") {
    const file = path.join(tmpdir(), "nanocode-clipboard.png")
    try {
      await exec("osascript", [
        "-e",
        'set imageData to the clipboard as "PNGf"',
        "-e",
        `set fileRef to open for access POSIX file "${file}" with write permission`,
        "-e",
        "set eof fileRef to 0",
        "-e",
        "write imageData to fileRef",
        "-e",
        "close access fileRef",
      ])
      return { data: (await readFile(file)).toString("base64"), mime: "image/png" }
    } catch {
      // Fall through to text clipboard.
    } finally {
      await rm(file, { force: true }).catch(() => {})
    }
  }

  if (platform() === "win32" || release().includes("WSL")) {
    const script =
      "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $ms = New-Object System.IO.MemoryStream; $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); [System.Convert]::ToBase64String($ms.ToArray()) }"
    const image = await command("powershell.exe", ["-NonInteractive", "-NoProfile", "-command", script]).catch(() =>
      Buffer.alloc(0),
    )
    if (image.length) return { data: image.toString().trim(), mime: "image/png" }
  }

  if (platform() === "linux") {
    const wayland = await command("wl-paste", ["-t", "image/png"]).catch(() => Buffer.alloc(0))
    if (wayland.length) return { data: wayland.toString("base64"), mime: "image/png" }
    const x11 = await command("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]).catch(() =>
      Buffer.alloc(0),
    )
    if (x11.length) return { data: x11.toString("base64"), mime: "image/png" }
  }

  const { default: clipboardy } = await import("clipboardy")
  const text = await clipboardy.read().catch(() => undefined)
  if (text) return { data: text, mime: "text/plain" }
}

export function copyCommand(
  os: NodeJS.Platform,
  wayland: boolean,
  has: (name: string) => boolean,
): string[] | undefined {
  if (os === "darwin" && has("pbcopy")) return ["pbcopy"]
  if (os === "linux" && wayland && has("wl-copy")) return ["wl-copy"]
  if (os === "linux" && has("xclip")) return ["xclip", "-selection", "clipboard"]
  if (os === "linux" && has("xsel")) return ["xsel", "--clipboard", "--input"]
  if (os === "win32" && has("powershell.exe")) {
    return [
      "powershell.exe",
      "-NonInteractive",
      "-NoProfile",
      "-Command",
      "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
    ]
  }
}

let copyMethod: Promise<(text: string) => Promise<void>> | undefined

function getCopyMethod() {
  return (copyMethod ??= (async () => {
    const { which } = await import("@nanocode-ai/core/util/which")
    const native = copyCommand(platform(), Boolean(process.env.WAYLAND_DISPLAY), (name) => Boolean(which(name)))
    if (native) {
      return async (text: string) => {
        await command(native[0], native.slice(1), text)
      }
    }
    return async (text: string) => {
      const { default: clipboardy } = await import("clipboardy")
      await clipboardy.write(text)
    }
  })())
}

export async function write(text: string) {
  writeOsc52(text)
  const method = await getCopyMethod()
  await method(text)
}
