import yargs from "yargs"
import type { CommandModule } from "yargs"
import { hideBin } from "yargs/helpers"
import { UI } from "./cli/ui"
import { InstallationVersion } from "@bettercode-ai/core/installation/version"
import { FormatError } from "./cli/error"
import { EOL } from "os"
import { errorMessage } from "./util/error"
import { Heap } from "./cli/heap"
import { lazyCmd } from "./cli/lazy"
import { NativeTmp } from "@bettercode-ai/core/filesystem/native-tmp"
// The default ($0) command is kept as an eager import, unlike every other
// subcommand below. yargs' `showHelp()` calls `runDefaultBuilderOn()` to
// populate the default command's options into the top-level `--help` output
// (e.g. so `--mini` shows up there); when that builder is async — as every
// `lazyCmd`-wrapped builder is, since it awaits a dynamic `import()` — yargs
// schedules the actual help text via a bare `.then()` that nothing awaits,
// so `cli.parse()`'s promise (and this file's `finally { process.exit() }`)
// can resolve and tear the process down before that callback ever runs,
// producing empty `--help` output. Since `$0` is also the single
// most-invoked command (running the TUI with no subcommand), keeping it
// eager loses little of the lazy-loading win while keeping `--help`
// synchronous end-to-end. See proposals/lightness-eager-cli-command-imports.md.
import { TuiThreadCommand } from "./cli/cmd/tui"

if (!process.env.BETTERCODE_DISABLE_TMP_SWEEP) {
  NativeTmp.ensureNativeTmpDir()
  NativeTmp.sweepStaleExtractions()
}

const args = hideBin(process.argv)

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("bettercode ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text + EOL)
    return
  }
  process.stderr.write(out)
}

const cli = yargs(args)
  .parserConfiguration({ "populate--": true })
  .scriptName("bettercode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .middleware(async (opts) => {
    if (opts.printLogs) process.env.BETTERCODE_PRINT_LOGS = "1"
    if (opts.logLevel) process.env.BETTERCODE_LOG_LEVEL = opts.logLevel
    if (opts.pure) {
      process.env.BETTERCODE_PURE = "1"
    }

    Heap.start()

    process.env.AGENT = "1"
    process.env.BETTERCODE = "1"
    process.env.BETTERCODE_PID = String(process.pid)
  })
  .usage("")
  .completion("completion", "generate shell completion script")
  .command(
    lazyCmd("acp", "start ACP (Agent Client Protocol) server", () =>
      import("./cli/cmd/acp").then((m) => m.AcpCommand),
    ),
  )
  .command(
    lazyCmd("mcp", "manage MCP (Model Context Protocol) servers", () =>
      import("./cli/cmd/mcp").then((m) => m.McpCommand),
    ),
  )
  .command(TuiThreadCommand)
  .command(
    lazyCmd("attach <url>", "attach to a running bettercode server", () =>
      import("./cli/cmd/attach").then((m) => m.AttachCommand),
    ),
  )
  .command(
    lazyCmd("run [message..]", "run bettercode with a message", () =>
      import("./cli/cmd/run").then((m) => m.RunCommand),
    ),
  )
  .command(lazyCmd("generate", false, () => import("./cli/cmd/generate").then((m) => m.GenerateCommand)))
  .command(
    lazyCmd("debug", "debugging and troubleshooting tools", () =>
      import("./cli/cmd/debug").then((m) => m.DebugCommand),
    ),
  )
  .command(lazyCmd("console", false, () => import("./cli/cmd/account").then((m) => m.ConsoleCommand)))
  .command(
    lazyCmd(
      "providers",
      "manage AI providers and credentials",
      () => import("./cli/cmd/providers").then((m) => m.ProvidersCommand),
      ["auth"],
    ),
  )
  .command(lazyCmd("agent", "manage agents", () => import("./cli/cmd/agent").then((m) => m.AgentCommand)))
  .command(
    lazyCmd("upgrade [target]", "upgrade bettercode to the latest or a specific version", () =>
      import("./cli/cmd/upgrade").then((m) => m.UpgradeCommand as CommandModule<any, any>),
    ),
  )
  .command(
    lazyCmd("uninstall", "uninstall bettercode and remove all related files", () =>
      import("./cli/cmd/uninstall").then((m) => m.UninstallCommand as unknown as CommandModule<any, any>),
    ),
  )
  .command(
    lazyCmd("serve", "starts a headless bettercode server", () =>
      import("./cli/cmd/serve").then((m) => m.ServeCommand),
    ),
  )
  .command(
    lazyCmd("web", "start bettercode server and open web interface", () =>
      import("./cli/cmd/web").then((m) => m.WebCommand),
    ),
  )
  .command(
    lazyCmd("models [provider]", "list all available models", () =>
      import("./cli/cmd/models").then((m) => m.ModelsCommand),
    ),
  )
  .command(
    lazyCmd("stats", "show token usage and cost statistics", () =>
      import("./cli/cmd/stats").then((m) => m.StatsCommand),
    ),
  )
  .command(
    lazyCmd("export [sessionID]", "export session data as JSON", () =>
      import("./cli/cmd/export").then((m) => m.ExportCommand),
    ),
  )
  .command(
    lazyCmd("import <file>", "import session data from JSON file or URL", () =>
      import("./cli/cmd/import").then((m) => m.ImportCommand),
    ),
  )
  .command(
    lazyCmd("github", "manage GitHub agent", () => import("./cli/cmd/github").then((m) => m.GithubCommand)),
  )
  .command(
    lazyCmd("pr <number>", "fetch and checkout a GitHub PR branch, then run bettercode", () =>
      import("./cli/cmd/pr").then((m) => m.PrCommand),
    ),
  )
  .command(
    lazyCmd("session", "manage sessions", () => import("./cli/cmd/session").then((m) => m.SessionCommand)),
  )
  .command(
    lazyCmd(
      "plugin <module>",
      "install plugin and update config",
      () => import("./cli/cmd/plug").then((m) => m.PluginCommand),
      ["plug"],
    ),
  )
  .command(lazyCmd("db", "database tools", () => import("./cli/cmd/db").then((m) => m.DbCommand)))
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp(show)
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    await cli.parse()
  }
} catch (e) {
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  process.exitCode = 1
} finally {
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
