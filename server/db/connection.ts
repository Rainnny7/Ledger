import path from "node:path"
import { Database } from "bun:sqlite"
import { DATA_DIR } from "../config/env.ts"
import { createSchema } from "./schema.ts"

/** SQLite handle for app data (WAL mode, foreign keys on). */
export const db = new Database(path.join(DATA_DIR, "app.db"))
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

/** Read or write a string value in the settings table. */
export function getSetting(key: string): string | null {
	const row = db
		.prepare(`SELECT value FROM app_setting WHERE key = ?`)
		.get(key) as { value: string } | null
	return row?.value ?? null
}

/** Read or write a string value in the settings table. */
export function setSetting(key: string, value: string) {
	db.prepare(
		`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`
	).run(key, value)
}

function hasColumn(table: string, column: string) {
	const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
		name: string
	}[]
	return cols.some((columnInfo) => columnInfo.name === column)
}

function addColumn(table: string, column: string, type: string) {
	if (!hasColumn(table, column)) {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
	}
}
