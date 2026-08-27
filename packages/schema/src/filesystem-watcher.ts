export * as FileSystemWatcher from "./filesystem-watcher"

import { Schema } from "effect"
import { define, inventory } from "./event"

const Updated = define({
  type: "file.watcher.updated",
  schema: {
    file: Schema.String,
    event: Schema.Literals(["add", "change", "unlink"]),
  },
})
const BatchUpdated = define({
  type: "file.watcher.batch-updated",
  schema: {
    files: Schema.Array(
      Schema.Struct({
        file: Schema.String,
        event: Schema.Literals(["add", "change", "unlink"]),
      }),
    ),
  },
})
export const Event = { Updated, BatchUpdated, Definitions: inventory(Updated, BatchUpdated) }
