import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  ToolSchema,
  type Tool as MCPToolDef,
} from "@modelcontextprotocol/sdk/types.js"
import { dynamicTool, jsonSchema, type JSONSchema7, type Tool } from "ai"
import { Effect } from "effect"
import { truncateDescription } from "@/util/text"

const DEFAULT_TIMEOUT = 30_000
const MAX_LIST_PAGES = 1_000
const MAX_DESCRIPTION_BYTES = 800
const MAX_TOTAL_TIMEOUT_MULTIPLIER = 4

const TolerantListToolsResultSchema = ListToolsResultSchema.extend({
  tools: ToolSchema.omit({ outputSchema: true }).array(),
})

export async function paginate<T, R extends { nextCursor?: string }>(
  list: (cursor?: string) => Promise<R>,
  items: (result: R) => T[],
) {
  const result: T[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const page = await list(cursor)
    result.push(...items(page))
    if (page.nextCursor === undefined) return result
    if (cursors.has(page.nextCursor)) throw new Error(`MCP list returned duplicate cursor: ${page.nextCursor}`)
    cursors.add(page.nextCursor)
    cursor = page.nextCursor
  }

  throw new Error(`MCP list exceeded ${MAX_LIST_PAGES} pages`)
}

export function defs(client: Client, timeout?: number) {
  return listTools(client, timeout ?? DEFAULT_TIMEOUT)
}

export function callToolWithProgressTimeout(
  client: Client,
  params: { name: string; arguments: Record<string, unknown> },
  opts: { timeout?: number; signal?: AbortSignal },
) {
  const effectiveTimeout = opts.timeout ?? DEFAULT_TIMEOUT
  return client.callTool(params, CallToolResultSchema, {
    resetTimeoutOnProgress: true,
    signal: opts.signal,
    timeout: opts.timeout,
    maxTotalTimeout: effectiveTimeout * MAX_TOTAL_TIMEOUT_MULTIPLIER,
    // The MCP SDK only sends a progress token when this hook is present, enabling timeout resets.
    onprogress: () => {},
  })
}

export function convertTool(mcpTool: MCPToolDef, client: Client, timeout?: number): Tool {
  const rawSchema = mcpTool.inputSchema as JSONSchema7
  const additionalProperties =
    rawSchema.additionalProperties !== undefined
      ? rawSchema.additionalProperties
      : rawSchema.patternProperties
        ? undefined
        : false
  const inputSchema: JSONSchema7 = {
    ...rawSchema,
    type: "object",
    properties: (rawSchema.properties ?? {}) as JSONSchema7["properties"],
    ...(additionalProperties !== undefined ? { additionalProperties } : {}),
  }

  const requiredParams = Array.isArray(inputSchema.required) ? (inputSchema.required as string[]) : []
  const description = mcpTool.description ?? ""
  const truncated = truncateDescription(description, MAX_DESCRIPTION_BYTES, requiredParams)
  if (truncated !== description) {
    Effect.runSync(
      Effect.logDebug("truncated oversized MCP tool description", {
        tool: mcpTool.name,
        originalBytes: Buffer.byteLength(description, "utf8"),
        truncatedBytes: Buffer.byteLength(truncated, "utf8"),
      }),
    )
  }

  return dynamicTool({
    description: truncated,
    inputSchema: jsonSchema(inputSchema),
    execute: async (args: unknown, options) => {
      const result = await callToolWithProgressTimeout(
        client,
        {
          name: mcpTool.name,
          arguments: (args || {}) as Record<string, unknown>,
        },
        { timeout, signal: options.abortSignal },
      )
      if (result.isError)
        throw new Error(
          result.content
            .flatMap((item) => (item.type === "text" ? [item.text] : []))
            .filter((text) => text.trim())
            .join("\n\n") || "MCP tool returned an error",
        )
      if (result.content.length > 0 || result.structuredContent === undefined || result.structuredContent === null)
        return result
      return {
        ...result,
        content: [{ type: "text" as const, text: JSON.stringify(result.structuredContent) }],
      }
    },
  })
}

export function fetch<T extends { name: string }>(
  clientName: string,
  client: Client,
  list: (client: Client) => Promise<T[]>,
  label: string,
  key?: (item: T) => string,
) {
  return Effect.tryPromise({
    try: () => list(client),
    catch: (error) => error,
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning(`failed to get ${label}`, {
        clientName,
        error: error instanceof Error ? error.message : String(error),
      }),
    ),
    Effect.map((items) => {
      const sanitizedClient = sanitize(clientName)
      // Escape both the separator and escape marker so `server:uri` keys remain unambiguous.
      const resourceClient = clientName.replaceAll("%", "%25").replaceAll(":", "%3A")
      return Object.fromEntries(
        items.map((item) => [
          key ? resourceClient + ":" + key(item) : sanitizedClient + ":" + sanitize(item.name),
          { ...item, client: clientName },
        ]),
      )
    }),
    Effect.orElseSucceed(() => undefined),
  )
}

export const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_")

export const toolName = (clientName: string, name: string) => sanitize(clientName) + "_" + sanitize(name)

export function prompts(client: Client, timeout?: number) {
  if (!client.getServerCapabilities()?.prompts) return Promise.resolve([])
  return paginate(
    (cursor) => client.listPrompts(cursor === undefined ? undefined : { cursor }, { timeout }),
    (result) => result.prompts,
  )
}

export function resources(client: Client, timeout?: number) {
  if (!client.getServerCapabilities()?.resources) return Promise.resolve([])
  return paginate(
    (cursor) => client.listResources(cursor === undefined ? undefined : { cursor }, { timeout }),
    (result) => result.resources,
  )
}

export function resourceTemplates(client: Client, timeout?: number) {
  if (!client.getServerCapabilities()?.resources) return Promise.resolve([])
  return paginate(
    (cursor) => client.listResourceTemplates(cursor === undefined ? undefined : { cursor }, { timeout }),
    (result) => result.resourceTemplates,
  )
}

function listTools(client: Client, timeout: number) {
  return Effect.tryPromise({
    try: () =>
      paginate(
        async (cursor) => {
          const params = cursor === undefined ? undefined : { cursor }
          try {
            return await client.listTools(params, { timeout })
          } catch (error) {
            if (!(error instanceof Error) || !isOutputSchemaValidationError(error)) throw error
            return client.request({ method: "tools/list", params }, TolerantListToolsResultSchema, { timeout })
          }
        },
        (result) => result.tools,
      ),
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  })
}

function isOutputSchemaValidationError(error: Error) {
  return /can't resolve reference|resolves to more than one schema|outputSchema|schema.*reference|reference.*schema/i.test(
    error.message,
  )
}

export * as McpCatalog from "./catalog"
