import { describe, expect, test } from "bun:test"
import { SessionV1 } from "@nanocode-ai/core/v1/session"
import { RETRY_GIVE_UP, RETRY_MAX_DELAY_HEADERS, delay } from "./retry"

function apiError(responseHeaders: Record<string, string>) {
  return new SessionV1.APIError({
    message: "rate limit",
    isRetryable: true,
    responseHeaders,
  })
}

describe("delay", () => {
  test("retry-after-ms within ceiling passes through", () => {
    const error = apiError({ "retry-after-ms": "1000" })
    expect(delay(1, error)).toBe(1000)
  })

  test("retry-after-ms beyond ceiling gives up", () => {
    const error = apiError({ "retry-after-ms": String(RETRY_MAX_DELAY_HEADERS + 1) })
    expect(delay(1, error)).toBe(RETRY_GIVE_UP)
  })

  test("retry-after seconds beyond ceiling gives up", () => {
    const error = apiError({ "retry-after": String(RETRY_MAX_DELAY_HEADERS / 1000 + 60) })
    expect(delay(1, error)).toBe(RETRY_GIVE_UP)
  })

  test("no headers uses bounded exponential backoff", () => {
    const wait = delay(1)
    expect(typeof wait).toBe("number")
    expect(wait as number).toBeLessThanOrEqual(30_000)
  })
})
