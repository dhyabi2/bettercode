import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260828000000_strip_summary_diff_patches",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        UPDATE \`session\`
        SET \`summary_diffs\` = (
          SELECT json_group_array(json_remove(je.value, '$.patch'))
          FROM json_each(\`session\`.\`summary_diffs\`) je
        )
        WHERE \`summary_diffs\` IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM json_each(\`session\`.\`summary_diffs\`) je
            WHERE json_extract(je.value, '$.patch') IS NOT NULL
          );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
