import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"
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
		readAt: text("read_at"),
		createdAt: timestampNow("created_at"),
	},
	(table) => [
		index("notification_user_read").on(table.userId, table.readAt),
	]
)