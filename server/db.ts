import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { DATA_DIR } from "./env.ts"
import { createSchema } from "./schema.ts"

export const db = new DatabaseSync(path.join(DATA_DIR, "app.db"))
db.exec(
  `PRAGMA journal_mode = WAL;
   PRAGMA synchronous = NORMAL;
   PRAGMA foreign_keys = ON;
   PRAGMA busy_timeout = 5000;`
)

/** App tables (Better Auth manages its own user/session/account/verification tables). */
export function migrateAppTables() {
  createSchema(db)

  // PayPal: the webhook registered on the user's REST app for instant updates.
  addColumn("bank_connection", "webhook_id", "TEXT")
  addColumn("bank_connection", "webhook_at", "TEXT")
  // Shares made before invitations existed were already live: keep them accepted.
  if (!hasColumn("share", "status")) {
    addColumn("share", "status", "TEXT NOT NULL DEFAULT 'pending'")
    db.exec(`UPDATE share SET status = 'accepted'`)
  }
}

export function getSetting(key: string): string | null {
  const row = db
    .prepare(`SELECT value FROM app_setting WHERE key = ?`)
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string) {
  db.prepare(
    `INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

function hasColumn(table: string, column: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string
  }[]
  return cols.some((c) => c.name === column)
}

function addColumn(table: string, column: string, type: string) {
  if (!hasColumn(table, column))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}
