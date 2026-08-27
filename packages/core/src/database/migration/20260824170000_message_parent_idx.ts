import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260824170000_message_parent_idx",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(
        `CREATE INDEX \`message_session_parent_idx\` ON \`message\` (\`session_id\`,json_extract("data", '$.parentID'));`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
