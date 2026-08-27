export * from "./client.js"
export * from "./server.js"

import { createNanocodeClient } from "./client.js"
import { createNanocodeServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createNanocode(options?: ServerOptions) {
  const server = await createNanocodeServer({
    ...options,
  })

  const client = createNanocodeClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
