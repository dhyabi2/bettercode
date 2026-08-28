import type { APIEvent } from "@solidjs/start"
import { waitUntil } from "@bettercode-ai/console-resource"
import type { DownloadPlatform } from "../types"

const prodAssetNames: Record<string, string> = {
  "darwin-aarch64-dmg": "bettercode-desktop-mac-arm64.dmg",
  "darwin-x64-dmg": "bettercode-desktop-mac-x64.dmg",
  "windows-x64-nsis": "bettercode-desktop-win-x64.exe",
  "linux-x64-deb": "bettercode-desktop-linux-amd64.deb",
  "linux-x64-appimage": "bettercode-desktop-linux-x86_64.AppImage",
  "linux-x64-rpm": "bettercode-desktop-linux-x86_64.rpm",
} satisfies Record<DownloadPlatform, string>

const betaAssetNames: Record<string, string> = {
  "darwin-aarch64-dmg": "bettercode-desktop-mac-arm64.dmg",
  "darwin-x64-dmg": "bettercode-desktop-mac-x64.dmg",
  "windows-x64-nsis": "bettercode-desktop-win-x64.exe",
  "linux-x64-deb": "bettercode-desktop-linux-amd64.deb",
  "linux-x64-appimage": "bettercode-desktop-linux-x86_64.AppImage",
  "linux-x64-rpm": "bettercode-desktop-linux-x86_64.rpm",
} satisfies Record<DownloadPlatform, string>

// Doing this on the server lets us preserve the original name for platforms we don't care to rename for
const downloadNames: Record<string, string> = {
  "darwin-aarch64-dmg": "BetterCode Desktop.dmg",
  "darwin-x64-dmg": "BetterCode Desktop.dmg",
  "windows-x64-nsis": "BetterCode Desktop Installer.exe",
} satisfies { [K in DownloadPlatform]?: string }

export async function GET({ params: { platform, channel } }: APIEvent) {
  const assetName = channel === "stable" ? prodAssetNames[platform] : betaAssetNames[platform]
  if (!assetName) return new Response(null, { status: 404 })

  const latest = await fetch(
    `https://github.com/dhyabi2/${channel === "stable" ? "bettercode" : "bettercode-beta"}/releases/latest/download/${assetName}`,
    { redirect: "manual" },
  )
  const location = latest.headers.get("location")
  if (!location) return new Response(null, { status: 502 })

  const key = new Request(location)
  const cache = (caches as CacheStorage & { default: Cache }).default
  const cached = await cache.match(key)
  if (cached) return download(cached, platform, "HIT")

  const resp = await fetch(location)
  if (!resp.ok) return resp

  const headers = new Headers(resp.headers)
  headers.set("cache-control", "public, max-age=31536000, immutable")
  headers.delete("set-cookie")
  const result = new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers })
  waitUntil(cache.put(key, result.clone()))
  return download(result, platform, "MISS")
}

function download(resp: Response, platform: string, cache: "HIT" | "MISS") {
  const downloadName = downloadNames[platform]
  const headers = new Headers(resp.headers)
  if (downloadName) headers.set("content-disposition", `attachment; filename="${downloadName}"`)
  headers.set("x-bettercode-cache", cache)

  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers })
}
