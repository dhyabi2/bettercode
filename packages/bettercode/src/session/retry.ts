import type { NamedError } from "@bettercode-ai/core/util/error"
import { SessionV1 } from "@bettercode-ai/core/v1/session"
import { Cause, Clock, Duration, Effect, Schedule } from "effect"
import { MessageV2 } from "./message-v2"
import { iife } from "@/util/iife"
import { isRecord } from "@/util/record"

export type Err = ReturnType<NamedError["toObject"]>

export const GO_UPSELL_MESSAGE = "Free usage exceeded, subscribe to Go"
export const GO_UPSELL_URL = "https://bettercode.ai/go"
export type RetryReason = "free_tier_limit" | "account_rate_limit" | (string & {})

export type Retryable = {
  message: string
  action?: {
    reason: RetryReason
    provider: string
    title: string
    message: string
    label: string
    link?: string
  }
}

export const RETRY_INITIAL_DELAY = 2000
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_JITTER_FACTOR = 0.25
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
export const RETRY_MAX_DELAY_HEADERS = 300_000 // 5 minutes - max wait we will actually sleep through based on a provider header
export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout
export const RETRY_MAX_RETRIES = 5

export const RETRY_GIVE_UP = Symbol("retry-give-up")

const RETRYABLE_STATUS_CODE_PATTERN = /(?<!\d)(429|500|502|503|504|524)(?!\d)/i

const RETRYABLE_PHRASE_PATTERNS = [
  /rate increased too quickly|rate limit|rate-limit|rate_limit|too many requests/i,
  /overloaded|service unavailable|service_unavailable|service-unavailable|internal error|internal_error|internal server error|server error|server_error|server-error|provider returned error|provider_returned_error|provider-returned-error/i,
  /terminated|fetch failed|failed to fetch|network[-_\s]error|upstream connect|connection error|connection refused|connection lost|socket connection was closed|socket hang up|reset before headers|getaddrinfo|enotfound|eai_again|econnrefused|econnreset|etimedout/i,
  /^timeout$|\b(?:request|response|connection|network|stream|read) (?:timeout|timed out|time out)\b/i,
  /try your request again|retry your request|resource exhausted|resource_exhausted/i,
  /\btry again (?:later|in\b)|\b(?:currently|temporarily) at capacity\b/i,
  /without a valid finish reason or content/i,
]

function cap(ms: number) {
  return Math.min(ms, RETRY_MAX_DELAY)
}

export function formatResetIn(rawSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(rawSeconds))
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.ceil((seconds % 3_600) / 60)
  const unit = (value: number, name: string) => `${value} ${name}${value === 1 ? "" : "s"}`

  if (days > 0) return hours > 0 ? `${unit(days, "day")} ${unit(hours, "hour")}` : unit(days, "day")
  if (hours > 0) return minutes > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(hours, "hour")
  return minutes > 0 ? unit(minutes, "minute") : "less than a minute"
}

function headerRetryAfterSeconds(headers: SessionV1.APIError["data"]["responseHeaders"]) {
  if (!headers) return undefined
  const ms = num(headers["retry-after-ms"])
  if (ms !== undefined) return ms / 1000
  const retryAfter = headers["retry-after"]
  if (retryAfter === undefined) return undefined
  const seconds = num(retryAfter)
  if (seconds !== undefined) return seconds
  const parsed = Date.parse(retryAfter) - Date.now()
  if (!Number.isNaN(parsed) && parsed > 0) return parsed / 1000
  return undefined
}

export function delay(
  attempt: number,
  error?: SessionV1.APIError,
  random = Math.random(),
): number | typeof RETRY_GIVE_UP {
  if (error) {
    const headers = error.data.responseHeaders
    if (headers) {
      const retryAfterMs = headers["retry-after-ms"]
      if (retryAfterMs) {
        const parsedMs = Number.parseFloat(retryAfterMs)
        if (!Number.isNaN(parsedMs)) {
          if (parsedMs > RETRY_MAX_DELAY_HEADERS) return RETRY_GIVE_UP
          return cap(parsedMs)
        }
      }

      const retryAfter = headers["retry-after"]
      if (retryAfter) {
        const parsedSeconds = Number.parseFloat(retryAfter)
        if (!Number.isNaN(parsedSeconds)) {
          // convert seconds to milliseconds
          const parsedMs = Math.ceil(parsedSeconds * 1000)
          if (parsedMs > RETRY_MAX_DELAY_HEADERS) return RETRY_GIVE_UP
          return cap(parsedMs)
        }
        // Try parsing as HTTP date format
        const parsed = Date.parse(retryAfter) - Date.now()
        if (!Number.isNaN(parsed) && parsed > 0) {
          const parsedMs = Math.ceil(parsed)
          if (parsedMs > RETRY_MAX_DELAY_HEADERS) return RETRY_GIVE_UP
          return cap(parsedMs)
        }
      }

      return cap(exponential(attempt, random))
    }
  }

  return cap(Math.min(exponential(attempt, random), RETRY_MAX_DELAY_NO_HEADERS))
}

function exponential(attempt: number, random: number) {
  const base = RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1)
  return Math.ceil(base + base * RETRY_JITTER_FACTOR * random)
}

export function retryable(error: Err, provider: string) {
  // context overflow errors should not be retried
  if (SessionV1.ContextOverflowError.isInstance(error)) return undefined
  // cancellations should never be retried, regardless of message content
  if (SessionV1.AbortedError.isInstance(error)) return undefined
  if (SessionV1.APIError.isInstance(error)) {
    const status = error.data.statusCode
    // 5xx errors are transient server failures and should always be retried,
    // even when the provider SDK doesn't explicitly mark them as retryable.
    if (
      !error.data.isRetryable &&
      !(status !== undefined && status >= 500) &&
      !matchesRetryableMessage(error.data.message, { includeStatusCodes: false }) &&
      !matchesRetryableMessage(error.data.responseBody, { includeStatusCodes: false })
    )
      return undefined
    if (error.data.responseBody?.includes("FreeUsageLimitError")) {
      return {
        message: GO_UPSELL_MESSAGE,
        action: {
          reason: "free_tier_limit",
          provider,
          title: "Free limit reached",
          message: "Subscribe to BetterCode Go for reliable access to the best open-source models for $10/month.",
          label: "subscribe",
          link: GO_UPSELL_URL,
        },
      }
    }
    if (error.data.responseBody?.includes("GoUsageLimitError")) {
      const body = parseJSON(error.data.responseBody)
      const workspace = str(body?.metadata?.workspace)
      const limitName = str(body?.metadata?.limitName)
      const retryAfter = num(error.data.responseHeaders?.["retry-after"])
      const resetIn = retryAfter === undefined ? "" : formatResetIn(retryAfter)

      const message = `${limitName ? `${limitName} usage limit` : "Usage limit"} reached. It will reset in ${resetIn}. To continue using this model now, enable usage from your available balance`

      const link = `https://bettercode.ai/workspace/${workspace}/go`
      return {
        message: `${message} - ${link}`,
        action: {
          reason: "account_rate_limit",
          provider,
          title: "Go limit reached",
          message,
          label: "open settings",
          link,
        },
      }
    }
    return { message: error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message }
  }

  const message = isRecord(error.data) ? error.data.message : undefined
  if (typeof message !== "string") return undefined
  const lower = message.toLowerCase()
  if (lower.includes("too_many_requests")) return { message: "Too Many Requests" }
  if (lower.includes("exhausted") || lower.includes("unavailable")) return { message: "Provider is overloaded" }
  if (matchesRetryableMessage(message)) return { message }
  return undefined
}

function matchesRetryableMessage(value: unknown, opts?: { includeStatusCodes?: boolean }) {
  if (typeof value !== "string") return false
  const includeStatusCodes = opts?.includeStatusCodes ?? true
  if (includeStatusCodes && RETRYABLE_STATUS_CODE_PATTERN.test(value)) return true
  return RETRYABLE_PHRASE_PATTERNS.some((pattern) => pattern.test(value))
}

function str(value: unknown) {
  if (value === undefined || value === null) return ""
  return String(value)
}

function num(value: unknown) {
  const parsed = Number.parseFloat(str(value))
  if (Number.isNaN(parsed)) return undefined
  return parsed
}

function parseJSON(value: unknown) {
  return iife(() => {
    try {
      if (typeof value !== "string") return undefined
      return JSON.parse(value)
    } catch {
      return undefined
    }
  })
}

export function policy(opts: {
  provider: string
  parse: (error: unknown) => Err
  set: (input: { attempt: number; message: string; action?: Retryable["action"]; next: number }) => Effect.Effect<void>
}) {
  return Schedule.fromStepWithMetadata(
    Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
      const error = opts.parse(meta.input)
      const retry = retryable(error, opts.provider)
      if (!retry) return Cause.done(meta.attempt)
      if (meta.attempt > RETRY_MAX_RETRIES) return Cause.done(meta.attempt)
      const apiError = SessionV1.APIError.isInstance(error) ? error : undefined
      const wait = delay(meta.attempt, apiError)
      if (wait === RETRY_GIVE_UP) {
        return Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          const retryAfterSeconds = headerRetryAfterSeconds(apiError?.data.responseHeaders)
          const resetIn = retryAfterSeconds === undefined ? undefined : formatResetIn(retryAfterSeconds)
          const message = resetIn ? `${retry.message}. Resets in ${resetIn}.` : retry.message
          yield* opts.set({
            attempt: meta.attempt,
            message,
            action: retry.action ?? {
              reason: "provider_rate_limit_long",
              provider: opts.provider,
              title: "Rate limited",
              message: resetIn ? `Resets in ${resetIn}. Retry manually once available.` : message,
              label: "retry now",
            },
            next: now,
          })
          return (yield* Cause.done(meta.attempt)) as [number, Duration.Duration]
        })
      }
      return Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        yield* opts.set({
          attempt: meta.attempt,
          message: retry.message,
          action: retry.action,
          next: now + wait,
        })
        return [meta.attempt, Duration.millis(wait)] as [number, Duration.Duration]
      })
    }),
  )
}

export * as SessionRetry from "./retry"
