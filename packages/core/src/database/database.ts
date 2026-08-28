export * as Database from "./database"

import { EffectDrizzleSqlite } from "@bettercode-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"
import { WalProbe } from "./wal-probe"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@bettercode/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const conflict = WalProbe.checkConflictingLock(path())
    if (conflict)
      yield* Effect.logWarning("another bettercode instance appears to be using this database", {
        pid: conflict.pid,
        path: path(),
      })
    WalProbe.writeLock(path())

    const db = yield* makeDatabase

    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)

    return { db }
  }).pipe(
    Effect.catch((cause) =>
      Effect.gen(function* () {
        const message = String(cause)
        if (!/SQLITE_CORRUPT|malformed|disk image/i.test(message)) return yield* Effect.die(cause)
        WalProbe.quarantineCorruptDatabase(path())
        yield* Effect.logWarning("bettercode.db appears corrupt, quarantined the file for inspection", { cause })
        return yield* Effect.die(cause)
      }),
    ),
  ),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })))
}

export function path() {
  if (Flag.BETTERCODE_DB) {
    if (Flag.BETTERCODE_DB === ":memory:" || isAbsolute(Flag.BETTERCODE_DB)) return Flag.BETTERCODE_DB
    return join(Global.Path.data, Flag.BETTERCODE_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.BETTERCODE_DISABLE_CHANNEL_DB === "1" ||
    process.env.BETTERCODE_DISABLE_CHANNEL_DB === "true"
  )
    return join(Global.Path.data, "bettercode.db")
  return join(Global.Path.data, `bettercode-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
