import { desc } from "drizzle-orm"
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { timestampNow } from "./columns.ts"

/** Instance-wide switches and small persisted state (registration, owner id, task runs, FX rates). */
export const appSetting = sqliteTable("app_setting", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
})

/** Admin actions and sign-in/out events. */
export const adminAudit = sqliteTable(
	"admin_audit",
	{
		id: text("id").primaryKey(),
		at: timestampNow("at"),
		actorId: text("actor_id"),
		actorEmail: text("actor_email"),
		action: text("action").notNull(),
		targetId: text("target_id"),
		targetEmail: text("target_email"),
		detail: text("detail"),
		kind: text("kind").notNull().default("admin"),
		ip: text("ip"),
	},
	(table) => [index("idx_admin_audit_at").on(desc(table.at))]
)
