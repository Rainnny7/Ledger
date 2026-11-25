import { index, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { user } from "./auth.ts"
import { timestampNow } from "./columns.ts"

/** People you share with. Email is lowercased; name is your label for them. */
export const contact = sqliteTable(
	"contact",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		name: text("name"),
		createdAt: timestampNow("created_at"),
	},
	(table) => [unique().on(table.userId, table.email)]
)

/**
 * A goal, subscription or job shared by its owner with another account ('view' or 'edit'). It is
 * an invitation ('pending') until the recipient accepts; only accepted shares grant access.
 */
export const share = sqliteTable(
	"share",
	{
		id: text("id").primaryKey(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text("kind").notNull(),
		itemId: text("item_id").notNull(),
		recipientId: text("recipient_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		permission: text("permission").notNull().default("view"),
		status: text("status").notNull().default("pending"),
		createdAt: timestampNow("created_at"),
	},
	(table) => [
		unique().on(table.kind, table.itemId, table.recipientId),
		index("share_recipient").on(table.recipientId, table.kind),
	]
)
