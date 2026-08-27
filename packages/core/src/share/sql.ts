import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"

export const SessionShareTable = sqliteTable("session_share", {
  session_id: text().primaryKey(),
  id: text().notNull(),
  secret: text().notNull(),
  url: text().notNull(),
  ...Timestamps,
})
