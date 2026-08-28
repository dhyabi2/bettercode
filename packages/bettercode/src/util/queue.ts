export class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = []
  private resolvers: ((value: T) => void)[] = []

  constructor(private maxSize?: number) {}

  push(item: T): boolean {
    const resolve = this.resolvers.shift()
    if (resolve) {
      resolve(item)
      return true
    }
    if (this.maxSize !== undefined && this.queue.length >= this.maxSize) return false
    this.queue.push(item)
    return true
  }

  async next(signal?: AbortSignal): Promise<T> {
    if (this.queue.length > 0) return this.queue.shift()!
    if (signal === undefined) return new Promise((resolve) => this.resolvers.push(resolve))
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const idx = this.resolvers.indexOf(entry)
        if (idx !== -1) this.resolvers.splice(idx, 1)
        reject(signal.reason ?? new Error("aborted"))
      }
      const entry = (value: T) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      }
      this.resolvers.push(entry)
      signal.addEventListener("abort", onAbort, { once: true })
    })
  }

  async *[Symbol.asyncIterator]() {
    while (true) yield await this.next()
  }
}

export async function work<T>(concurrency: number, items: T[], fn: (item: T) => Promise<void>) {
  const pending = [...items]
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const item = pending.pop()
        if (item === undefined) return
        await fn(item)
      }
    }),
  )
}
