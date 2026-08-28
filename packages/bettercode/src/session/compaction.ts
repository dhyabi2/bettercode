import { LayerNode } from "@bettercode-ai/core/effect/layer-node"
import { SessionV1 } from "@bettercode-ai/core/v1/session"
import { ConfigV1 } from "@bettercode-ai/core/v1/config/config"
import { Session } from "./session"
import { SessionID, MessageID, PartID } from "./schema"
import { Provider } from "@/provider/provider"
import { MessageV2 } from "./message-v2"
import { Token } from "@/util/token"
import { SessionProcessor } from "./processor"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Config } from "@/config/config"
import { NotFoundError } from "@/storage/storage"

import { Effect, Layer, Context } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { isOverflow as overflow, usable } from "./overflow"
import { serviceUse } from "@bettercode-ai/core/effect/service-use"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { ProviderV2 } from "@bettercode-ai/core/provider"
import { ModelV2 } from "@bettercode-ai/core/model"
import { buildCompactionSystem, buildCompactionUser } from "@bettercode-ai/core/session/compaction"
import { SessionCompactionEvent } from "@bettercode-ai/schema/session-compaction-event"

export const Event = SessionCompactionEvent

export const PRUNE_MINIMUM = 20_000
export const PRUNE_PROTECT = 40_000
const DEFAULT_PRUNE_PROTECT_RATIO = 0.25
const DEFAULT_PRUNE_MINIMUM_RATIO = 0.1
const PRUNE_PROTECT_FLOOR = 2_000
const PRUNE_MINIMUM_FLOOR = 2_000
const TOOL_OUTPUT_MAX_CHARS = 2_000
const TOOL_INPUT_MAX_CHARS = 2_000
const REASONING_MAX_CHARS = 1_000
const TOOL_ERROR_MAX_CHARS = 1_000
const MESSAGE_SERIALIZED_MAX_CHARS = 8_000
const PRUNE_PROTECTED_TOOLS = ["skill"]
const MIN_PRESERVE_RECENT_TOKENS = 2_000
const MAX_PRESERVE_RECENT_TOKENS = 15_000
// Flat per-media-part surcharge for budget estimation: real vision providers charge
// roughly a fixed per-image cost (tile-based), not a cost proportional to base64 length.
const MEDIA_TOKEN_ESTIMATE = 1_600
type Turn = {
  start: number
  end: number
  id: MessageID
}

type Tail = {
  start: number
  id: MessageID
}

type CompletedCompaction = {
  userIndex: number
  assistantIndex: number
  summary: string | undefined
}

const truncate = (value: string, max = TOOL_OUTPUT_MAX_CHARS) =>
  value.length <= max ? value : `${value.slice(0, max)}\n[truncated]`

const serialize = (message: SessionV1.WithParts) => {
  if (message.info.role === "user") {
    const text = message.parts
      .filter((part): part is SessionV1.TextPart => part.type === "text" && !part.ignored)
      .map((part) => part.text)
      .filter(Boolean)
      .join("\n")
    const files = message.parts.flatMap((part) =>
      part.type === "file" ? [`[Attached ${part.mime}: ${part.filename ?? "file"}]`] : [],
    )
    return [...(text ? [`[User]: ${text}`] : []), ...files].join("\n")
  }
  const serialized = message.parts
    .flatMap((part) => {
      if (part.type === "text") return part.text ? [`[Assistant]: ${part.text}`] : []
      if (part.type === "reasoning")
        return part.text ? [`[Assistant reasoning]: ${truncate(part.text, REASONING_MAX_CHARS)}`] : []
      if (part.type !== "tool") return []
      const call = `[Assistant tool call]: ${part.tool}(${truncate(JSON.stringify(part.state.input), TOOL_INPUT_MAX_CHARS)})`
      if (part.state.status === "completed") {
        const attachments = (part.state.attachments ?? []).map(
          (item) => `[Attached ${item.mime}: ${item.filename ?? "file"}]`,
        )
        const output = part.state.time.compacted
          ? "[Old tool result content cleared]"
          : truncate([part.state.output, ...attachments].join("\n"))
        return [call, `[Tool result]: ${output}`]
      }
      if (part.state.status === "error")
        return [call, `[Tool error]: ${truncate(String(part.state.error), TOOL_ERROR_MAX_CHARS)}`]
      return [call]
    })
    .join("\n")
  return truncate(serialized, MESSAGE_SERIALIZED_MAX_CHARS)
}

function summaryText(message: SessionV1.WithParts) {
  const text = message.parts
    .filter((part): part is SessionV1.TextPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim()
  return text || undefined
}

const AUTO_COMPACTION_STREAK_LIMIT = 3
const TERMINAL_FINISH_REASONS = ["stop", "length", "content-filter", "error"]

function trailingAutoCompactionStreak(messages: SessionV1.WithParts[]) {
  let streak = 0
  let i = messages.length - 1
  while (i >= 1) {
    const assistant = messages[i]
    if (
      assistant.info.role !== "assistant" ||
      !assistant.info.summary ||
      !assistant.info.finish ||
      assistant.info.error
    )
      break
    const user = messages[i - 1]
    if (user.info.role !== "user") break
    const compactionPart = user.parts.find((part): part is SessionV1.CompactionPart => part.type === "compaction")
    if (!compactionPart?.auto) break
    streak++
    i -= 2
  }
  return streak
}

function completedCompactions(messages: SessionV1.WithParts[]) {
  const users = new Map<MessageID, number>()
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.info.role !== "user") continue
    if (!msg.parts.some((part) => part.type === "compaction")) continue
    users.set(msg.info.id, i)
  }

  return messages.flatMap((msg, assistantIndex): CompletedCompaction[] => {
    if (msg.info.role !== "assistant") return []
    if (!msg.info.summary || !msg.info.finish || msg.info.error) return []
    const userIndex = users.get(msg.info.parentID)
    if (userIndex === undefined) return []
    return [{ userIndex, assistantIndex, summary: summaryText(msg) }]
  })
}

function calibratedCharsPerToken(messages: SessionV1.WithParts[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.info.role !== "assistant" || !msg.info.tokens?.input) continue
    const chars = JSON.stringify(messages.slice(0, i + 1)).length
    return chars / msg.info.tokens.input
  }
  return 4
}

function preserveRecentBudget(input: { cfg: ConfigV1.Info; model: Provider.Model }) {
  return (
    input.cfg.compaction?.preserve_recent_tokens ??
    Math.min(
      MAX_PRESERVE_RECENT_TOKENS,
      Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable({ ...input, outputTokenMax: undefined }) * 0.25)),
    )
  )
}

function turns(messages: SessionV1.WithParts[]) {
  const result: Turn[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.info.role !== "user") continue
    if (msg.parts.some((part) => part.type === "compaction")) continue
    result.push({
      start: i,
      end: messages.length,
      id: msg.info.id,
    })
  }
  for (let i = 0; i < result.length - 1; i++) {
    result[i].end = result[i + 1].start
  }
  return result
}

function splitTurn(input: {
  messages: SessionV1.WithParts[]
  turn: Turn
  model: Provider.Model
  budget: number
  charsPerToken: number
  estimate: (input: {
    messages: SessionV1.WithParts[]
    model: Provider.Model
    charsPerToken: number
  }) => Effect.Effect<number>
}) {
  return Effect.gen(function* () {
    if (input.budget <= 0) return undefined
    if (input.turn.end - input.turn.start <= 1) return undefined
    const costs: number[] = []
    for (let i = input.turn.start; i < input.turn.end; i++) {
      costs.push(
        yield* input.estimate({
          messages: [input.messages[i]!],
          model: input.model,
          charsPerToken: input.charsPerToken,
        }),
      )
    }
    const suffixSums = new Array<number>(costs.length + 1).fill(0)
    for (let i = costs.length - 1; i >= 0; i--) {
      suffixSums[i] = suffixSums[i + 1]! + costs[i]!
    }
    for (let i = 1; i < costs.length; i++) {
      if (suffixSums[i]! > input.budget) continue
      const start = input.turn.start + i
      return {
        start,
        id: input.messages[start]!.info.id,
      } satisfies Tail
    }
    return undefined
  })
}

export interface Interface {
  readonly isOverflow: (input: {
    tokens: SessionV1.Assistant["tokens"]
    model: Provider.Model
    messages?: SessionV1.WithParts[]
  }) => Effect.Effect<boolean>
  readonly estimate: (input: {
    messages: SessionV1.WithParts[]
    model: Provider.Model
    charsPerToken?: number
  }) => Effect.Effect<number>
  readonly prune: (input: { sessionID: SessionID }) => Effect.Effect<void>
  readonly process: (input: {
    parentID: MessageID
    messages: SessionV1.WithParts[]
    sessionID: SessionID
    auto: boolean
    overflow?: boolean
  }) => Effect.Effect<"continue" | "stop">
  readonly create: (input: {
    sessionID: SessionID
    agent: string
    model: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
    auto: boolean
    overflow?: boolean
    finish?: string
  }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@bettercode/SessionCompaction") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const session = yield* Session.Service
    const agents = yield* Agent.Service
    const plugin = yield* Plugin.Service
    const processors = yield* SessionProcessor.Service
    const provider = yield* Provider.Service
    const events = yield* EventV2Bridge.Service
    const flags = yield* RuntimeFlags.Service

    const isOverflow = Effect.fn("SessionCompaction.isOverflow")(function* (input: {
      tokens: SessionV1.Assistant["tokens"]
      model: Provider.Model
      messages?: SessionV1.WithParts[]
    }) {
      const zeroUsage =
        !input.tokens.total &&
        !input.tokens.input &&
        !input.tokens.output &&
        !input.tokens.cache.read &&
        !input.tokens.cache.write
      const estimateTokens =
        zeroUsage && input.messages
          ? yield* estimate({
              messages: input.messages,
              model: input.model,
              charsPerToken: calibratedCharsPerToken(input.messages),
            })
          : undefined
      return overflow({
        cfg: yield* config.get(),
        tokens: input.tokens,
        model: input.model,
        outputTokenMax: flags.outputTokenMax,
        estimateTokens,
      })
    })

    const estimate = Effect.fn("SessionCompaction.estimate")(function* (input: {
      messages: SessionV1.WithParts[]
      model: Provider.Model
      charsPerToken?: number
    }) {
      const msgs = yield* MessageV2.toModelMessagesEffect(input.messages, input.model, {
        stripMedia: true,
      })
      const mediaParts = input.messages.reduce(
        (count, message) =>
          count + message.parts.filter((part) => part.type === "file" && MessageV2.isMedia(part.mime)).length,
        0,
      )
      return Token.estimate(JSON.stringify(msgs), input.charsPerToken) + mediaParts * MEDIA_TOKEN_ESTIMATE
    })

    const select = Effect.fn("SessionCompaction.select")(function* (input: {
      messages: SessionV1.WithParts[]
      cfg: ConfigV1.Info
      model: Provider.Model
    }) {
      const limit = input.cfg.compaction?.tail_turns
      if (limit !== undefined && limit <= 0) return { head: input.messages, tail_start_id: undefined }
      const budget = preserveRecentBudget({ cfg: input.cfg, model: input.model })
      const all = turns(input.messages)
      if (!all.length) return { head: input.messages, tail_start_id: undefined }
      const recent = limit === undefined ? all : all.slice(-limit)
      const charsPerToken = calibratedCharsPerToken(input.messages)

      let total = 0
      let keep: Tail | undefined
      for (let i = recent.length - 1; i >= 0; i--) {
        const turn = recent[i]!
        // estimate lazily so cost stays proportional to the retained tail, not the whole session
        const size = yield* estimate({
          messages: input.messages.slice(turn.start, turn.end),
          model: input.model,
          charsPerToken,
        })
        if (total + size <= budget) {
          total += size
          keep = { start: turn.start, id: turn.id }
          continue
        }
        const remaining = budget - total
        const split = yield* splitTurn({
          messages: input.messages,
          turn,
          model: input.model,
          budget: remaining,
          charsPerToken,
          estimate,
        })
        if (split) keep = split
        else if (!keep) {
          yield* Effect.logInfo("tail fallback", { budget, size, total })
        }
        break
      }

      if (!keep || keep.start === 0) return { head: input.messages, tail_start_id: undefined }
      return {
        head: input.messages.slice(0, keep.start),
        tail_start_id: keep.id,
      }
    })

    // goes backwards through parts until there are PRUNE_PROTECT tokens worth of tool
    // calls, then erases output of older tool calls to free context space
    const prune = Effect.fn("SessionCompaction.prune")(function* (input: {
      sessionID: SessionID
      model?: Provider.Model
    }) {
      const cfg = yield* config.get()
      if (cfg.compaction?.prune === false) return
      yield* Effect.logInfo("pruning")

      const msgs = yield* session
        .messages({ sessionID: input.sessionID })
        .pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.succeed(undefined)))
      if (!msgs) return

      const budget = input.model ? usable({ cfg, model: input.model, outputTokenMax: undefined }) : undefined
      const pruneProtectRatio = cfg.compaction?.pruneProtectRatio ?? DEFAULT_PRUNE_PROTECT_RATIO
      const pruneMinimumRatio = cfg.compaction?.pruneMinimumRatio ?? DEFAULT_PRUNE_MINIMUM_RATIO
      const pruneProtect = budget
        ? Math.max(PRUNE_PROTECT_FLOOR, Math.floor(budget * pruneProtectRatio))
        : PRUNE_PROTECT
      const pruneMinimum = budget
        ? Math.max(PRUNE_MINIMUM_FLOOR, Math.floor(budget * pruneMinimumRatio))
        : PRUNE_MINIMUM

      let total = 0
      let pruned = 0
      const toPrune: SessionV1.ToolPart[] = []
      let turns = 0
      const charsPerToken = calibratedCharsPerToken(msgs)

      loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
        const msg = msgs[msgIndex]
        if (msg.info.role === "user") turns++
        if (turns < 2) continue
        if (msg.info.role === "assistant" && msg.info.summary) break loop
        for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
          const part = msg.parts[partIndex]
          if (part.type !== "tool") continue
          if (part.state.status !== "completed") continue
          if (PRUNE_PROTECTED_TOOLS.includes(part.tool)) continue
          if (part.state.time.compacted) break loop
          const estimate = Token.estimate(part.state.output, charsPerToken)
          total += estimate
          if (total <= pruneProtect) continue
          pruned += estimate
          toPrune.push(part)
        }
      }

      yield* Effect.logInfo("found", { pruned, total })
      if (pruned > pruneMinimum) {
        for (const part of toPrune) {
          if (part.state.status === "completed") {
            part.state.time.compacted = Date.now()
            yield* session.updatePart(part)
          }
        }
        yield* Effect.logInfo("pruned", { count: toPrune.length })
      }
    })

    const processCompaction = Effect.fn("SessionCompaction.process")(function* (input: {
      parentID: MessageID
      messages: SessionV1.WithParts[]
      sessionID: SessionID
      auto: boolean
      overflow?: boolean
    }) {
      const parent = input.messages.findLast((m) => m.info.id === input.parentID)
      if (!parent || parent.info.role !== "user") {
        throw new Error(`Compaction parent must be a user message: ${input.parentID}`)
      }
      const userMessage = parent.info
      const compactionPart = parent.parts.find((part): part is SessionV1.CompactionPart => part.type === "compaction")

      let messages = input.messages
      let replay:
        | {
            info: SessionV1.User
            parts: SessionV1.Part[]
          }
        | undefined
      if (input.overflow) {
        const idx = input.messages.findIndex((m) => m.info.id === input.parentID)
        for (let i = idx - 1; i >= 0; i--) {
          const msg = input.messages[i]
          if (msg.info.role === "user" && !msg.parts.some((p) => p.type === "compaction")) {
            replay = { info: msg.info, parts: msg.parts }
            messages = input.messages.slice(0, i)
            break
          }
        }
        const hasContent =
          replay && messages.some((m) => m.info.role === "user" && !m.parts.some((p) => p.type === "compaction"))
        if (!hasContent) {
          replay = undefined
          messages = input.messages
        }
      }

      const agent = yield* agents.get("compaction")
      const model = agent.model
        ? yield* provider.getModel(agent.model.providerID, agent.model.modelID).pipe(Effect.orDie)
        : yield* provider.getModel(userMessage.model.providerID, userMessage.model.modelID).pipe(Effect.orDie)
      const cfg = yield* config.get()
      const history = compactionPart && messages.at(-1)?.info.id === input.parentID ? messages.slice(0, -1) : messages
      const prior = completedCompactions(history)
      const hidden = new Set(prior.flatMap((item) => [item.userIndex, item.assistantIndex]))
      const previousSummary = prior.at(-1)?.summary
      const selected = yield* select({
        messages: history.filter((_, index) => !hidden.has(index)),
        cfg,
        model,
      })
      // Allow plugins to inject context or replace compaction prompt.
      const compacting = yield* plugin.trigger(
        "experimental.session.compacting",
        { sessionID: input.sessionID },
        { context: [], prompt: undefined },
      )
      const msgs = structuredClone(selected.head)
      yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })
      const conversation = msgs.map(serialize).filter(Boolean).join("\n\n")
      const compactionSystem = buildCompactionSystem(previousSummary !== undefined)
      const nextPrompt =
        compacting.prompt ??
        [
          buildCompactionUser({
            previousSummary,
            context: [conversation],
          }),
          ...compacting.context,
        ]
          .filter(Boolean)
          .join("\n\n")
      const ctx = yield* InstanceState.context
      const msg: SessionV1.Assistant = {
        id: MessageID.ascending(),
        role: "assistant",
        parentID: input.parentID,
        sessionID: input.sessionID,
        mode: "compaction",
        agent: "compaction",
        variant: userMessage.model.variant,
        summary: true,
        path: {
          cwd: ctx.directory,
          root: ctx.worktree,
        },
        cost: 0,
        tokens: {
          output: 0,
          input: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        modelID: model.id,
        providerID: model.providerID,
        time: {
          created: Date.now(),
        },
      }
      yield* session.updateMessage(msg)
      const processor = yield* processors.create({
        assistantMessage: msg,
        sessionID: input.sessionID,
        model,
      })

      if (input.auto && trailingAutoCompactionStreak(history) >= AUTO_COMPACTION_STREAK_LIMIT) {
        processor.message.error = new SessionV1.ContextOverflowError({
          message: "Auto-compaction looped without making progress",
        }).toObject()
        processor.message.finish = "error"
        yield* session.updateMessage(processor.message)
        return "stop"
      }

      const result = yield* processor.process({
        user: userMessage,
        agent,
        sessionID: input.sessionID,
        tools: {},
        system: compacting.prompt ? [] : [compactionSystem],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  nextPrompt,
                  ...(compacting.prompt ? ["The following is the conversation history:", conversation] : []),
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
            ],
          },
        ],
        model,
      })

      if (typeof result === "object" && result.status === "compact") {
        processor.message.error = new SessionV1.ContextOverflowError({
          message: replay
            ? "Conversation history too large to compact - exceeds model context limit"
            : "Session too large to compact - context exceeds model limit even after stripping media",
        }).toObject()
        processor.message.finish = "error"
        yield* session.updateMessage(processor.message)
        return "stop"
      }

      if (compactionPart && selected.tail_start_id && compactionPart.tail_start_id !== selected.tail_start_id) {
        yield* session.updatePart({
          ...compactionPart,
          tail_start_id: selected.tail_start_id,
        })
      }

      if (result === "continue" && input.auto) {
        if (replay) {
          const original = replay.info
          const replayMsg = yield* session.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID: input.sessionID,
            time: { created: Date.now() },
            agent: original.agent,
            model: original.model,
            format: original.format,
            tools: original.tools,
            system: original.system,
          })
          for (const part of replay.parts) {
            if (part.type === "compaction") continue
            const replayPart =
              part.type === "file" && MessageV2.isMedia(part.mime)
                ? { type: "text" as const, text: `[Attached ${part.mime}: ${part.filename ?? "file"}]` }
                : part
            yield* session.updatePart({
              ...replayPart,
              id: PartID.ascending(),
              messageID: replayMsg.id,
              sessionID: input.sessionID,
            })
          }
        }

        if (!replay && !TERMINAL_FINISH_REASONS.includes(compactionPart?.sourceFinish ?? "")) {
          const info = yield* provider.getProvider(userMessage.model.providerID)
          if (
            (yield* plugin.trigger(
              "experimental.compaction.autocontinue",
              {
                sessionID: input.sessionID,
                agent: userMessage.agent,
                model: yield* provider
                  .getModel(userMessage.model.providerID, userMessage.model.modelID)
                  .pipe(Effect.orDie),
                provider: {
                  source: info.source,
                  info,
                  options: info.options,
                },
                message: userMessage,
                overflow: input.overflow === true,
              },
              { enabled: true },
            )).enabled
          ) {
            const continueMsg = yield* session.updateMessage({
              id: MessageID.ascending(),
              role: "user",
              sessionID: input.sessionID,
              time: { created: Date.now() },
              agent: userMessage.agent,
              model: userMessage.model,
            })
            const text =
              (input.overflow
                ? "The previous request exceeded the provider's size limit due to large media attachments. The conversation was compacted and media files were removed from context. If the user was asking about attached images or files, explain that the attachments were too large to process and suggest they try again with smaller or fewer files.\n\n"
                : "") +
              "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: continueMsg.id,
              sessionID: input.sessionID,
              type: "text",
              // Internal marker for auto-compaction followups so provider plugins
              // can distinguish them from manual post-compaction user prompts.
              // This is not a stable plugin contract and may change or disappear.
              metadata: { compaction_continue: true },
              synthetic: true,
              text,
              time: {
                start: Date.now(),
                end: Date.now(),
              },
            })
          }
        }
      }

      if (processor.message.error) return "stop"
      if (result === "continue") {
        yield* events.publish(Event.Compacted, { sessionID: input.sessionID })
      }
      return result === "continue" ? "continue" : "stop"
    })

    const create = Effect.fn("SessionCompaction.create")(function* (input: {
      sessionID: SessionID
      agent: string
      model: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      auto: boolean
      overflow?: boolean
      finish?: string
    }) {
      const msg = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        model: input.model,
        sessionID: input.sessionID,
        agent: input.agent,
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: msg.id,
        sessionID: msg.sessionID,
        type: "compaction",
        auto: input.auto,
        overflow: input.overflow,
        sourceFinish: input.finish,
      })
    })

    return Service.of({
      isOverflow,
      estimate,
      prune,
      process: processCompaction,
      create,
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [
    Config.node,
    Session.node,
    Agent.node,
    Plugin.node,
    SessionProcessor.node,
    Provider.node,
    EventV2Bridge.node,
    RuntimeFlags.node,
  ],
})

export * as SessionCompaction from "./compaction"
