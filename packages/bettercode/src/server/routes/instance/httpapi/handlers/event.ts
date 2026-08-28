import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { GlobalBus } from "@/bus/global"
import { EventV2 } from "@bettercode-ai/core/event"
import { Effect, Queue } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { EventApi } from "../groups/event"
import { serialize } from "./event-serialize"

function eventData(event: { id: string; type: string; properties?: unknown; json?: string }): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: event.id,
    data: event.json ?? JSON.stringify({ id: event.id, type: event.type, properties: event.properties }),
  }
}

function eventID() {
  return EventV2.ID.create()
}

function eventResponse(events: EventV2.Interface, permission: Permission.Interface) {
  return Effect.gen(function* () {
    const instance = yield* InstanceState.context
    const workspaceID = yield* InstanceState.workspaceID
    // Listener registration is eager, so events published after this point cannot
    // be lost while the HTTP body fiber is starting or emitting server.connected.
    const queue = yield* Queue.dropping<EventV2.Payload>(1024)
    const overflow = yield* Queue.bounded<{ id: string; type: string; properties: unknown }>(1)
    const unsubscribe = yield* events.listen((event) =>
      Effect.gen(function* () {
        if (
          event.location?.directory !== instance.directory ||
          (event.location.workspaceID !== undefined && event.location.workspaceID !== workspaceID)
        )
          return
        const offered = Queue.offerUnsafe(queue, event)
        if (!offered) {
          yield* Effect.logWarning("event queue overflow, forcing disconnect")
          Queue.offerUnsafe(overflow, { id: eventID(), type: "server.queue.overflow", properties: {} })
        }
      }),
    )
    yield* Effect.addFinalizer(() => unsubscribe)
    // Replay any still-pending permission asks so a client connecting after the
    // original publish (reconnect, new tab, headless consumer) still sees them.
    const pending = yield* permission.list()
    for (const info of pending) {
      Queue.offerUnsafe(queue, {
        id: EventV2.ID.create(),
        type: Permission.Event.Asked.type,
        data: info,
      } as EventV2.Payload)
    }
    const stream = Stream.fromQueue(queue).pipe(
      Stream.map((event) => ({
        id: event.id,
        type: event.type,
        properties: event.data,
        json: serialize(event, (e) => ({ id: e.id, type: e.type, properties: e.data })),
      })),
    )
    const disposed = Stream.callback<{ id: string; type: string; properties: unknown }>((queue) => {
      const listener = (event: {
        directory?: string
        payload: { id?: string; type?: string; properties?: unknown }
      }) => {
        if (event.directory !== instance.directory || event.payload.type !== "server.instance.disposed") return
        Queue.offerUnsafe(queue, {
          id: event.payload.id ?? eventID(),
          type: "server.instance.disposed",
          properties: event.payload.properties ?? {},
        })
      }
      return Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", listener)),
        () => Effect.sync(() => GlobalBus.off("event", listener)),
      )
    })
    const output = stream.pipe(
      Stream.merge(disposed, { haltStrategy: "left" }),
      Stream.merge(Stream.fromQueue(overflow), { haltStrategy: "left" }),
      Stream.takeUntil(
        (event) => event.type === "server.instance.disposed" || event.type === "server.queue.overflow",
      ),
    )
    const heartbeat = Stream.tick("10 seconds").pipe(
      Stream.drop(1),
      Stream.map(() => ({ id: eventID(), type: "server.heartbeat", properties: {} })),
    )

    yield* Effect.logInfo("event connected")
    return HttpServerResponse.stream(
      Stream.make({ id: eventID(), type: "server.connected", properties: {} }).pipe(
        Stream.concat(output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
        Stream.map(eventData),
        Stream.pipeThroughChannel(Sse.encode()),
        Stream.encodeText,
        Stream.ensuring(Effect.logInfo("event disconnected")),
      ),
      {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      },
    )
  })
}

export const eventHandlers = HttpApiBuilder.group(EventApi, "event", (handlers) =>
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const permission = yield* Permission.Service
    return handlers.handleRaw(
      "subscribe",
      Effect.fn("EventHttpApi.subscribe")(function* () {
        return yield* eventResponse(events, permission)
      }),
    )
  }),
)
