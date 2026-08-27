import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

const COMPACTED = [
  { type: "session.updated.1", path: "$.info.id" },
  { type: "message.updated.1", path: "$.info.id" },
  { type: "message.part.updated.1", path: "$.part.id" },
] as const

export default {
  id: "20260824160000_compact_event_backlog",
  up(tx) {
    return Effect.gen(function* () {
      for (const { type, path } of COMPACTED) {
        yield* tx.run(`
          DELETE FROM event
          WHERE type = '${type}'
            AND seq < (
              SELECT MAX(e2.seq)
              FROM event e2
              WHERE e2.aggregate_id = event.aggregate_id
                AND e2.type = event.type
                AND json_extract(e2.data, '${path}') = json_extract(event.data, '${path}')
            );
        `)
      }
    })
  },
} satisfies DatabaseMigration.Migration
