export * from "./client.js"
export * from "./server.js"

import { createBettercodeClient } from "./client.js"
import { createBettercodeServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createBettercode(options?: ServerOptions) {
  const server = await createBettercodeServer({
    ...options,
  })

  const client = createBettercodeClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
