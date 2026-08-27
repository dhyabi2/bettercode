import type { Arguments, Argv, CommandModule } from "yargs"

export function lazyCmd(
  command: string | readonly string[],
  describe: string | false,
  loader: () => Promise<CommandModule<any, any>>,
  aliases?: string | readonly string[],
): CommandModule<any, any> {
  let promise: Promise<CommandModule<any, any>> | undefined
  const resolve = () => (promise ??= loader())
  return {
    command,
    describe,
    aliases,
    builder: async (yargs: Argv) => {
      const mod = await resolve()
      return typeof mod.builder === "function" ? await mod.builder(yargs) : yargs
    },
    handler: async (args: Arguments) => {
      const mod = await resolve()
      await mod.handler(args)
    },
  }
}
