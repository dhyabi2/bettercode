import { LayerNode } from "@nanocode-ai/core/effect/layer-node"
import { ConfigPermissionV1 } from "@nanocode-ai/core/v1/config/permission"
import { InstanceState } from "@/effect/instance-state"
import { Wildcard } from "@nanocode-ai/core/util/wildcard"
import { redactPreview } from "@nanocode-ai/core/observability/redact"
import { Deferred, Effect, Layer, Context } from "effect"
import os from "os"
import { PermissionV1 } from "@nanocode-ai/core/v1/permission"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"

export const Event = PermissionV1.Event

export interface Interface {
  readonly ask: (input: PermissionV1.AskInput) => Effect.Effect<void, PermissionV1.Error>
  readonly reply: (input: PermissionV1.ReplyInput) => Effect.Effect<void, PermissionV1.NotFoundError>
  readonly list: () => Effect.Effect<ReadonlyArray<PermissionV1.Request>>
}

interface PendingEntry {
  info: PermissionV1.Request
  deferred: Deferred.Deferred<void, PermissionV1.RejectedError | PermissionV1.CorrectedError>
}

interface State {
  pending: Map<PermissionV1.ID, PendingEntry>
  approved: Map<string, PermissionV1.Rule[]>
  sessionApproved: Map<string, PermissionV1.Rule[]>
}

const PATH_PERMISSIONS = new Set(["external_directory", "read", "edit", "glob", "grep"])
const PERMISSION_ASK_TIMEOUT = "10 minutes"
const SESSION_SCOPED_PERMISSIONS = new Set(["doom_loop"])

export function evaluate(permission: string, pattern: string, ...rulesets: PermissionV1.Ruleset[]): PermissionV1.Rule {
  const pathMode = PATH_PERMISSIONS.has(permission)
  return (
    rulesets
      .flat()
      .findLast(
        (rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern, { pathMode }),
      ) ?? {
      action: "ask",
      permission,
      pattern: "*",
    }
  )
}

export class Service extends Context.Service<Service, Interface>()("@nanocode/Permission") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const session = yield* Session.Service
    const state = yield* InstanceState.make<State>(
      Effect.fn("Permission.state")(function* (ctx) {
        void ctx
        const state = {
          pending: new Map<PermissionV1.ID, PendingEntry>(),
          approved: new Map<string, PermissionV1.Rule[]>(),
          sessionApproved: new Map<string, PermissionV1.Rule[]>(),
        }

        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            for (const item of state.pending.values()) {
              yield* Deferred.fail(item.deferred, new PermissionV1.RejectedError())
            }
            state.pending.clear()
          }),
        )

        return state
      }),
    )

    const ask = Effect.fn("Permission.ask")(function* (input: PermissionV1.AskInput) {
      const { approved, pending, sessionApproved } = yield* InstanceState.get(state)
      const { ruleset, ...request } = input

      const rootSessionID = yield* Effect.gen(function* () {
        const visited = new Set<string>()
        let current = request.sessionID
        while (!visited.has(current)) {
          visited.add(current)
          const parentID = yield* session.get(current).pipe(
            Effect.map((info) => info.parentID),
            Effect.catchTag("NotFoundError", () => Effect.succeed(undefined)),
          )
          if (!parentID) break
          current = parentID
        }
        return current
      })

      let needsAsk = false

      for (const pattern of request.patterns) {
        const rule = evaluate(
          request.permission,
          pattern,
          ruleset,
          approved.get(rootSessionID) ?? [],
          sessionApproved.get(request.sessionID) ?? [],
        )
        yield* Effect.logInfo("evaluated", {
          permission: request.permission,
          pattern: redactPreview(pattern),
          action: rule,
        })
        if (rule.action === "deny") {
          return yield* new PermissionV1.DeniedError({
            ruleset: ruleset.filter((rule) => Wildcard.match(request.permission, rule.permission)),
          })
        }
        if (rule.action === "allow") continue
        needsAsk = true
      }

      if (!needsAsk) return

      const id = request.id ?? PermissionV1.ID.ascending()
      const info: PermissionV1.Request = {
        id,
        sessionID: request.sessionID,
        rootSessionID,
        permission: request.permission,
        patterns: request.patterns,
        metadata: request.metadata,
        always: request.always,
        tool: request.tool,
      }
      yield* Effect.logInfo("asking", {
        id,
        permission: info.permission,
        patterns: info.patterns.map(redactPreview),
      })

      const deferred = yield* Deferred.make<void, PermissionV1.RejectedError | PermissionV1.CorrectedError>()
      pending.set(id, { info, deferred })
      yield* events.publish(Event.Asked, info)
      return yield* Deferred.await(deferred).pipe(
        Effect.timeoutOrElse({
          duration: PERMISSION_ASK_TIMEOUT,
          orElse: () =>
            Effect.gen(function* () {
              if (pending.has(id)) {
                yield* events.publish(Event.Replied, { sessionID: info.sessionID, requestID: id, reply: "reject" })
              }
              return yield* new PermissionV1.TimeoutError()
            }),
        }),
        Effect.ensuring(
          Effect.sync(() => {
            pending.delete(id)
          }),
        ),
      )
    })

    const reply = Effect.fn("Permission.reply")(function* (input: PermissionV1.ReplyInput) {
      const { approved, pending, sessionApproved } = yield* InstanceState.get(state)
      const existing = pending.get(input.requestID)
      if (!existing) return yield* new PermissionV1.NotFoundError({ requestID: input.requestID })

      pending.delete(input.requestID)
      yield* events.publish(Event.Replied, {
        sessionID: existing.info.sessionID,
        requestID: existing.info.id,
        reply: input.reply,
      })

      if (input.reply === "reject") {
        yield* Deferred.fail(
          existing.deferred,
          input.message
            ? new PermissionV1.CorrectedError({ feedback: input.message })
            : new PermissionV1.RejectedError(),
        )

        for (const [id, item] of pending.entries()) {
          if (item.info.sessionID !== existing.info.sessionID) continue
          pending.delete(id)
          yield* events.publish(Event.Replied, {
            sessionID: item.info.sessionID,
            requestID: item.info.id,
            reply: "reject",
          })
          yield* Deferred.fail(item.deferred, new PermissionV1.RejectedError())
        }
        return
      }

      yield* Deferred.succeed(existing.deferred, undefined)
      if (input.reply === "once") return

      if (SESSION_SCOPED_PERMISSIONS.has(existing.info.permission)) {
        const rules = sessionApproved.get(existing.info.sessionID) ?? []
        for (const pattern of existing.info.always) {
          rules.push({
            permission: existing.info.permission,
            pattern,
            action: "allow",
          })
        }
        sessionApproved.set(existing.info.sessionID, rules)
      } else {
        const scopeID = existing.info.rootSessionID ?? existing.info.sessionID
        const rules = approved.get(scopeID) ?? []
        for (const pattern of existing.info.always) {
          rules.push({
            permission: existing.info.permission,
            pattern,
            action: "allow",
          })
        }
        approved.set(scopeID, rules)
      }

      for (const [id, item] of pending.entries()) {
        if (item.info.sessionID !== existing.info.sessionID) continue
        const scopeID = item.info.rootSessionID ?? item.info.sessionID
        const ok = item.info.patterns.every(
          (pattern) =>
            evaluate(item.info.permission, pattern, approved.get(scopeID) ?? [], sessionApproved.get(item.info.sessionID) ?? [])
              .action === "allow",
        )
        if (!ok) continue
        pending.delete(id)
        yield* events.publish(Event.Replied, {
          sessionID: item.info.sessionID,
          requestID: item.info.id,
          reply: "always",
        })
        yield* Deferred.succeed(item.deferred, undefined)
      }
    })

    const list = Effect.fn("Permission.list")(function* () {
      const pending = (yield* InstanceState.get(state)).pending
      return Array.from(pending.values(), (item) => item.info)
    })

    return Service.of({ ask, reply, list })
  }),
)

function expand(pattern: string): string {
  if (pattern.startsWith("~/")) return os.homedir() + pattern.slice(1)
  if (pattern === "~") return os.homedir()
  if (pattern.startsWith("$HOME/")) return os.homedir() + pattern.slice(5)
  if (pattern.startsWith("$HOME")) return os.homedir() + pattern.slice(5)
  return pattern
}

export function fromConfig(permission: ConfigPermissionV1.Info) {
  const ruleset: PermissionV1.Rule[] = []
  for (const [key, value] of Object.entries(permission)) {
    if (typeof value === "string") {
      ruleset.push({ permission: key, action: value, pattern: "*" })
      continue
    }
    ruleset.push(
      ...Object.entries(value).map(([pattern, action]) => ({ permission: key, pattern: expand(pattern), action })),
    )
  }
  return ruleset
}

export function merge(...rulesets: PermissionV1.Ruleset[]): PermissionV1.Rule[] {
  return rulesets.flat()
}

export function disabled(tools: string[], ruleset: PermissionV1.Ruleset): Set<string> {
  const edits = ["edit", "write", "apply_patch"]
  const reads = ["list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"]
  return new Set(
    tools.filter((tool) => {
      const permission = edits.includes(tool) ? "edit" : reads.includes(tool) ? "read" : tool
      const rule = ruleset.findLast((rule) => Wildcard.match(permission, rule.permission))
      return rule?.pattern === "*" && rule.action === "deny"
    }),
  )
}

export function visibleTools<T>(tools: Record<string, T>, ruleset: PermissionV1.Ruleset): Record<string, T> {
  const hidden = disabled(Object.keys(tools), ruleset)
  return Object.fromEntries(Object.entries(tools).filter(([name]) => !hidden.has(name)))
}

export const node = LayerNode.make({ service: Service, layer: layer, deps: [EventV2Bridge.node, Session.node] })

export * as Permission from "."
