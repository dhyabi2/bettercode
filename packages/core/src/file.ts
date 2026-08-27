export * as File from "./file"

import { Revert } from "@nanocode-ai/schema/revert"

export const Diff = Revert.FileDiff
export type Diff = typeof Diff.Type
