import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260824150000_drop_session_share_cascade",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`PRAGMA defer_foreign_keys=ON;`)
      yield* tx.run(`
        CREATE TABLE \`__new_session_share\` (
          \`session_id\` text PRIMARY KEY,
          \`id\` text NOT NULL,
          \`secret\` text NOT NULL,
          \`url\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`INSERT INTO \`__new_session_share\` SELECT * FROM \`session_share\`;`)
      yield* tx.run(`DROP TABLE \`session_share\`;`)
      yield* tx.run(`ALTER TABLE \`__new_session_share\` RENAME TO \`session_share\`;`)
    })
  },
} satisfies DatabaseMigration.Migration
