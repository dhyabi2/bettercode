import { Effect } from "effect"
import { applyPatch, createTwoFilesPatch } from "diff"
import { createHash } from "node:crypto"
import { FSUtil } from "@nanocode-ai/core/fs-util"
import * as Bom from "@/util/bom"

function signature(existed: boolean, text: string): string {
  if (!existed) return "absent"
  return createHash("sha256").update(text).digest("hex")
}

export const verifyUnchanged = Effect.fn("ConcurrentWrite.verifyUnchanged")(function* (
  afs: FSUtil.Interface,
  filePath: string,
  existedOld: boolean,
  contentOld: string,
) {
  const existsNow = yield* afs.existsSafe(filePath)
  const currentText = existsNow ? (yield* Bom.readFile(afs, filePath)).text : ""
  if (signature(existsNow, currentText) === signature(existedOld, contentOld)) return
  throw new Error(`File changed on disk since it was read; re-read ${filePath} and retry the edit`)
})

export const verifyUnchangedOrMerge = Effect.fn("ConcurrentWrite.verifyUnchangedOrMerge")(function* (
  afs: FSUtil.Interface,
  filePath: string,
  contentOld: string,
  contentNew: string,
) {
  const existsNow = yield* afs.existsSafe(filePath)
  if (!existsNow) throw new Error(`File changed on disk since it was read; re-read ${filePath} and retry the edit`)
  const current = yield* Bom.readFile(afs, filePath)
  if (signature(true, current.text) === signature(true, contentOld)) return contentNew
  const patch = createTwoFilesPatch(filePath, filePath, contentOld, contentNew)
  const merged = applyPatch(current.text, patch)
  if (merged === false) throw new Error(`File changed on disk since it was read; re-read ${filePath} and retry the edit`)
  return merged
})
