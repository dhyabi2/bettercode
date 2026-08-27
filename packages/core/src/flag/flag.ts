import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["NANOCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["NANOCODE_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("NANOCODE_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  NANOCODE_AUTO_HEAP_SNAPSHOT: truthy("NANOCODE_AUTO_HEAP_SNAPSHOT"),
  NANOCODE_GIT_BASH_PATH: process.env["NANOCODE_GIT_BASH_PATH"],
  NANOCODE_CONFIG: process.env["NANOCODE_CONFIG"],
  NANOCODE_CONFIG_CONTENT: process.env["NANOCODE_CONFIG_CONTENT"],
  NANOCODE_DISABLE_AUTOUPDATE: truthy("NANOCODE_DISABLE_AUTOUPDATE"),
  NANOCODE_ALWAYS_NOTIFY_UPDATE: truthy("NANOCODE_ALWAYS_NOTIFY_UPDATE"),
  NANOCODE_DISABLE_PRUNE: truthy("NANOCODE_DISABLE_PRUNE"),
  NANOCODE_DISABLE_TERMINAL_TITLE: truthy("NANOCODE_DISABLE_TERMINAL_TITLE"),
  NANOCODE_SHOW_TTFD: truthy("NANOCODE_SHOW_TTFD"),
  NANOCODE_DISABLE_AUTOCOMPACT: truthy("NANOCODE_DISABLE_AUTOCOMPACT"),
  NANOCODE_DISABLE_MODELS_FETCH: truthy("NANOCODE_DISABLE_MODELS_FETCH"),
  NANOCODE_DISABLE_MOUSE: truthy("NANOCODE_DISABLE_MOUSE"),
  NANOCODE_FAKE_VCS: process.env["NANOCODE_FAKE_VCS"],
  NANOCODE_SERVER_PASSWORD: process.env["NANOCODE_SERVER_PASSWORD"],
  NANOCODE_SERVER_USERNAME: process.env["NANOCODE_SERVER_USERNAME"],
  NANOCODE_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("NANOCODE_DISABLE_FFF"),

  // Experimental
  NANOCODE_EXPERIMENTAL_FILEWATCHER: Config.boolean("NANOCODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  NANOCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("NANOCODE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  NANOCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("NANOCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  NANOCODE_MODELS_URL: process.env["NANOCODE_MODELS_URL"],
  NANOCODE_MODELS_PATH: process.env["NANOCODE_MODELS_PATH"],
  NANOCODE_DB: process.env["NANOCODE_DB"],

  NANOCODE_WORKSPACE_ID: process.env["NANOCODE_WORKSPACE_ID"],
  NANOCODE_EXPERIMENTAL_WORKSPACES: enabledByExperimental("NANOCODE_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get NANOCODE_DISABLE_PROJECT_CONFIG() {
    return truthy("NANOCODE_DISABLE_PROJECT_CONFIG")
  },
  get NANOCODE_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("NANOCODE_EXPERIMENTAL_REFERENCES")
  },
  get NANOCODE_TUI_CONFIG() {
    return process.env["NANOCODE_TUI_CONFIG"]
  },
  get NANOCODE_CONFIG_DIR() {
    return process.env["NANOCODE_CONFIG_DIR"]
  },
  get NANOCODE_PURE() {
    return truthy("NANOCODE_PURE")
  },
  get NANOCODE_PERMISSION() {
    return process.env["NANOCODE_PERMISSION"]
  },
  get NANOCODE_PLUGIN_META_FILE() {
    return process.env["NANOCODE_PLUGIN_META_FILE"]
  },
  get NANOCODE_CLIENT() {
    return process.env["NANOCODE_CLIENT"] ?? "cli"
  },
}
