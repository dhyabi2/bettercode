import { describe, expect } from "bun:test"
import { BackgroundJob } from "@nanocode-ai/core/background-job"
import { LayerNode } from "@nanocode-ai/core/effect/layer-node"
import { Deferred, Effect, Exit, Scope } from "effect"
import { it } from "./lib/effect"

const jobsLayer = LayerNode.compile(BackgroundJob.node)

describe("BackgroundJob", () => {
  it.live("tracks process-local work through explicit observation", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const latch = yield* Deferred.make<void>()
      const job = yield* jobs.start({
        type: "test",
        metadata: { durable: false },
        run: Deferred.await(latch).pipe(Effect.as("done")),
      })

      expect(job).toMatchObject({ type: "test", status: "running", metadata: { durable: false } })
      expect(yield* jobs.wait({ id: job.id, timeout: 0 })).toMatchObject({
        timedOut: true,
        info: { status: "running" },
      })

      yield* Deferred.succeed(latch, undefined)
      expect(yield* jobs.wait({ id: job.id })).toMatchObject({
        timedOut: false,
        info: { status: "completed", output: "done" },
      })
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("publishes jobs before starting immediately settling work", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service

      yield* Effect.forEach(Array.from({ length: 100 }), (_, index) => {
        const id = `job_immediate_start_${index}`
        return Effect.gen(function* () {
          const job = yield* jobs.start({
            id,
            type: "test",
            run: jobs
              .get(id)
              .pipe(
                Effect.flatMap((info) =>
                  info?.status === "running"
                    ? Effect.succeed(`done-${index}`)
                    : Effect.fail("job started before publish"),
                ),
              ),
          })

          expect(yield* jobs.wait({ id: job.id })).toMatchObject({
            timedOut: false,
            info: { status: "completed", output: `done-${index}` },
          })
        })
      })
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("increments pending work before starting immediately settling extensions", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service

      yield* Effect.forEach(Array.from({ length: 100 }), (_, index) =>
        Effect.gen(function* () {
          const first = yield* Deferred.make<void>()
          const job = yield* jobs.start({
            type: "test",
            run: Deferred.await(first).pipe(Effect.as(`first-${index}`)),
          })

          expect(yield* jobs.extend({ id: job.id, run: Effect.succeed(`second-${index}`) })).toBe(true)
          expect((yield* jobs.get(job.id))?.status).toBe("running")

          yield* Deferred.succeed(first, undefined)
          expect(yield* jobs.wait({ id: job.id })).toMatchObject({
            timedOut: false,
            info: { status: "completed", output: `second-${index}` },
          })
        }),
      )
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("cancelChain catches a job registered from within another job's own run", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const childRegistered = yield* Deferred.make<string>()

      yield* jobs.start({
        id: "job_root",
        type: "test",
        metadata: { sessionId: "session_root" },
        run: Effect.gen(function* () {
          const child = yield* jobs.start({
            type: "test",
            metadata: { parentSessionId: "job_root" },
            run: Effect.never,
          })
          yield* Deferred.succeed(childRegistered, child.id)
          return yield* Effect.never
        }),
      })

      const childId = yield* Deferred.await(childRegistered)
      const cancelled = yield* jobs.cancelChain("session_root")

      expect(cancelled.map((info) => info.id).sort()).toEqual(["job_root", childId].sort())
      expect((yield* jobs.get("job_root"))?.status).toBe("cancelled")
      expect((yield* jobs.get(childId))?.status).toBe("cancelled")
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("caps retained terminal jobs while never evicting a still-running job", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const latch = yield* Deferred.make<void>()
      const running = yield* jobs.start({
        id: "job_still_running",
        type: "test",
        run: Deferred.await(latch).pipe(Effect.as("done")),
      })

      yield* Effect.forEach(
        Array.from({ length: 250 }),
        (_, index) =>
          jobs.start({
            id: `job_terminal_cap_${index}`,
            type: "test",
            run: Effect.succeed(`done-${index}`),
          }),
        { discard: true },
      )

      const all = yield* jobs.list()
      expect(all.length).toBeLessThanOrEqual(201)
      expect(all.some((info) => info.id === running.id && info.status === "running")).toBe(true)

      yield* Deferred.succeed(latch, undefined)
      yield* jobs.wait({ id: running.id })
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("interrupts live work without promising settlement after the owning process-local scope closes", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const interrupted = yield* Deferred.make<void>()
      const jobs = yield* BackgroundJob.make.pipe(Scope.provide(scope))
      const job = yield* jobs.start({
        type: "test",
        run: Effect.never.pipe(Effect.ensuring(Deferred.succeed(interrupted, undefined))),
      })

      yield* Scope.close(scope, Exit.void)

      yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
      // The abandoned in-memory registry is not a durable observation channel.
      expect((yield* jobs.get(job.id))?.status).toBe("running")
    }),
  )
})
