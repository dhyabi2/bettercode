export * as NativeTmp from "./native-tmp"

import fs from "fs"
import os from "os"
import path from "path"

const APP_DIR_NAME = "nanocode"
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const GRACE_PERIOD_MS = 60 * 60 * 1000

// Historical Bun native-addon extraction filenames, e.g. ".a1b2c3d4e5f6a7b8-12345678.so"
const EXTRACTION_PATTERN = /^\.[0-9a-f]{16}-\d+\.(so|dylib|node)$/
const KNOWN_LIBRARY_PATTERN = /^lib(opentui|parcel[-_]?watcher|fff)/i

// Captured before any TMPDIR redirect so legacy leaks in the real system tmp dir are still found.
const systemTmpDir = os.tmpdir()
export const nativeTmpDir = path.join(os.homedir(), ".cache", APP_DIR_NAME, "native-tmp")

export function ensureNativeTmpDir(): string {
  try {
    fs.mkdirSync(nativeTmpDir, { recursive: true })
    process.env.TMPDIR = nativeTmpDir
  } catch {}
  return nativeTmpDir
}

export function isStaleExtractionArtifact(name: string): boolean {
  return EXTRACTION_PATTERN.test(name) || KNOWN_LIBRARY_PATTERN.test(name)
}

function sweepDir(dir: string, cutoff: number) {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!isStaleExtractionArtifact(entry.name)) continue
    const file = path.join(dir, entry.name)
    try {
      if (fs.statSync(file).mtimeMs > cutoff) continue
      fs.unlinkSync(file)
    } catch {}
  }
}

export function shouldRunSweep(markerFile: string, now: number): boolean {
  try {
    return now - fs.statSync(markerFile).mtimeMs >= SWEEP_INTERVAL_MS
  } catch {
    return true
  }
}

export function sweepStaleExtractions(): void {
  try {
    const markerFile = path.join(nativeTmpDir, ".last-sweep")
    const now = Date.now()
    if (!shouldRunSweep(markerFile, now)) return

    const cutoff = now - GRACE_PERIOD_MS
    sweepDir(systemTmpDir, cutoff)
    if (nativeTmpDir !== systemTmpDir) sweepDir(nativeTmpDir, cutoff)

    fs.mkdirSync(nativeTmpDir, { recursive: true })
    fs.writeFileSync(markerFile, String(now))
  } catch {}
}
