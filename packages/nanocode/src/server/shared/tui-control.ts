import { AsyncQueue } from "@/util/queue"
import { Schema } from "effect"

export const TuiRequest = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  body: Schema.Unknown,
})

export type TuiRequest = Schema.Schema.Type<typeof TuiRequest>

const REQUEST_MAX_SIZE = 32
const RESPONSE_TTL_MS = 30_000

const request = new AsyncQueue<TuiRequest>(REQUEST_MAX_SIZE)
const pendingResponses = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

export function nextTuiRequest(signal?: AbortSignal) {
  return request.next(signal)
}

export function submitTuiRequest(body: Omit<TuiRequest, "id">) {
  const id = crypto.randomUUID()
  request.push({ ...body, id })
}

export function nextTuiResponse(id: string) {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResponses.delete(id)
      reject(new Error(`tui response timed out for request ${id}`))
    }, RESPONSE_TTL_MS)
    pendingResponses.set(id, {
      resolve: (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      },
    })
  })
}

export function submitTuiResponse(id: string, body: unknown) {
  const pending = pendingResponses.get(id)
  if (!pending) return
  pendingResponses.delete(id)
  pending.resolve(body)
}
