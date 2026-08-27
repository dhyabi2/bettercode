export * as DatabaseMigration from "./migration"

import { sql } from "drizzle-orm"
import { Effect, Schedule, Semaphore } from "effect"
import { isSqlError } from "effect/unstable/sql/SqlError"
import type { EffectDrizzleSqlite } from "@nanocode-ai/effect-drizzle-sqlite"
import { migrations } from "./migration.gen"
import schema from "./schema.gen"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
const lock = Semaphore.makeUnsafe(1)

// A second process's BEGIN IMMEDIATE blocks on SQLite's busy_timeout (5s), but
// a migration run that legitimately takes longer than that surfaces as
// SQLITE_BUSY/SQLITE_LOCKED instead of just waiting. Retry a handful of times
// with backoff so the second process keeps waiting rather than dying.
const isLockTimeout = (error: unknown) => isSqlError(error) && error.reason._tag === "LockTimeoutError"
const retryOnLock = Effect.retry({
  while: isLockTimeout,
  schedule: Schedule.exponential(200).pipe(Schedule.both(Schedule.recurs(3))),
})

export type Migration = {
  id: string
  up: (tx: Transaction) => Effect.Effect<void, unknown>
}

export function apply(db: Database) {
  return lock.withPermit(
    Effect.gen(function* () {
      const tables = yield* db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      if (tables.some((table) => table.name === "session")) return yield* applyOnly(db, migrations)
      if (tables.length > 0) return yield* Effect.die("Database is not empty and has no session table")
      yield* db
        .transaction(
          (tx) =>
            Effect.gen(function* () {
              yield* schema.up(tx)
              yield* tx.run(
                sql`CREATE TABLE ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
              )
              yield* Effect.forEach(migrations, (migration) =>
                tx.run(
                  sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
                ),
              )
            }),
          { behavior: "immediate" },
        )
        .pipe(retryOnLock)
    }),
  )
}

// Do not use PRAGMA foreign_keys=OFF/ON in migrations — it is a no-op inside
// the transaction this runner opens. Use PRAGMA defer_foreign_keys=ON instead.
export function applyOnly(db: Database, input: Migration[]) {
  return Effect.gen(function* () {
    yield* db.run(
      sql`CREATE TABLE IF NOT EXISTS ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
    )

    yield* db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            let completed = new Set(
              (yield* tx.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map(
                (row) => row.id,
              ),
            )
            if (completed.size === 0) {
              // Existing installs used Drizzle's migration journal. Seed the new
              // journal once so TypeScript migrations don't replay old SQL.
              if (
                yield* tx.get(
                  sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${"__drizzle_migrations"}`,
                )
              ) {
                yield* tx.run(sql`
                INSERT OR IGNORE INTO ${sql.identifier("migration")} (id, time_completed)
                SELECT name, ${Date.now()}
                FROM ${sql.identifier("__drizzle_migrations")}
                WHERE name IS NOT NULL
              `)
                completed = new Set(
                  (yield* tx.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map(
                    (row) => row.id,
                  ),
                )
              }
            }

            for (const migration of input) {
              if (completed.has(migration.id)) continue
              yield* migration.up(tx)
              yield* tx.run(
                sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
              )
            }
          }),
        { behavior: "immediate" },
      )
      .pipe(retryOnLock)
  })
}
