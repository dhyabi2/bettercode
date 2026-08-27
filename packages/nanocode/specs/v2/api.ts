// @ts-nocheck

import { NanoCode } from "@nanocode-ai/core"
import { ReadTool } from "@nanocode-ai/core/tools"

const nanocode = NanoCode.make({})

nanocode.tool.add(ReadTool)

nanocode.tool.add({
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

nanocode.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

nanocode.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await nanocode.session.create({
  agent: "build",
})

nanocode.subscribe((event) => {
  console.log(event)
})

await nanocode.session.prompt({
  sessionID,
  text: "hey what is up",
})

await nanocode.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await nanocode.session.wait()

console.log(await nanocode.session.messages(sessionID))
