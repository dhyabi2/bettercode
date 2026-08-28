import { describe, expect, test } from "bun:test"
import { NativeTmp } from "@bettercode-ai/core/filesystem/native-tmp"

describe("native tmp sweep", () => {
  test("matches historical Bun extraction filenames", () => {
    expect(NativeTmp.isStaleExtractionArtifact(".a1b2c3d4e5f6a7b8-00000001.so")).toBe(true)
    expect(NativeTmp.isStaleExtractionArtifact(".a1b2c3d4e5f6a7b8-00000001.dylib")).toBe(true)
    expect(NativeTmp.isStaleExtractionArtifact(".a1b2c3d4e5f6a7b8-00000001.node")).toBe(true)
  })

  test("matches known native library basenames", () => {
    expect(NativeTmp.isStaleExtractionArtifact("libopentui.so")).toBe(true)
    expect(NativeTmp.isStaleExtractionArtifact("libparcel-watcher.dylib")).toBe(true)
    expect(NativeTmp.isStaleExtractionArtifact("libfff.node")).toBe(true)
  })

  test("does not match unrelated files", () => {
    expect(NativeTmp.isStaleExtractionArtifact("notes.txt")).toBe(false)
    expect(NativeTmp.isStaleExtractionArtifact(".last-sweep")).toBe(false)
    expect(NativeTmp.isStaleExtractionArtifact("random.so")).toBe(false)
  })

  test("rate-limits repeated sweeps", () => {
    const now = Date.now()
    expect(NativeTmp.shouldRunSweep("/does/not/exist", now)).toBe(true)
  })
})
