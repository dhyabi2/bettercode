export * as Token from "./token"

const CHARS_PER_TOKEN = 4
const MIN_CHARS_PER_TOKEN = 1
const MAX_CHARS_PER_TOKEN = 8

export const estimate = (input: string, charsPerToken = CHARS_PER_TOKEN) =>
  Math.max(0, Math.round(input.length / Math.min(MAX_CHARS_PER_TOKEN, Math.max(MIN_CHARS_PER_TOKEN, charsPerToken))))
