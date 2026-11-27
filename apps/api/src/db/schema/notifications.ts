import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core"
import { user } from "./auth.ts"
import { timestampNow } from "./columns.ts"

/** In-app notifications for a single user (optional link and email mirror via {@link notifyUser}). */
export const notification = sqliteTable(
	"notification",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text("kind").notNull().default("info"),
		title: text("title").notNull(),
		body: text("body").notNull(),
		href: text("href"),
		/** `admin`, a {@link NotificationSource}, or null for legacy and unrouted notices. */
		source: text("source"),
		readAt: text("read_at"),
		createdAt: timestampNow("created_at"),
	},
	(table) => [index("notification_user_read").on(table.userId, table.readAt)]
)

/** Per-source email and in-app delivery toggles for one user (each defaults on). */
export const notificationPreference = sqliteTable(
	"notification_preference",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		source: text("source").notNull(),
		email: integer("email", { mode: "boolean" }).notNull().default(true),
		inApp: integer("in_app", { mode: "boolean" }).notNull().default(true),
		discord: integer("discord", { mode: "boolean" })
			.notNull()
			.default(false),
	},
	(table) => [primaryKey({ columns: [table.userId, table.source] })]
)
