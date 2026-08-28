// @ts-nocheck

import { BetterCode } from "@bettercode-ai/core"
import { ReadTool } from "@bettercode-ai/core/tools"

const bettercode = BetterCode.make({})

bettercode.tool.add(ReadTool)

bettercode.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

bettercode.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

bettercode.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await bettercode.session.create({
  agent: "build",
})

bettercode.subscribe((event) => {
  console.log(event)
})

await bettercode.session.prompt({
  sessionID,
  text: "hey what is up",
})

await bettercode.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await bettercode.session.wait()

console.log(await bettercode.session.messages(sessionID))
