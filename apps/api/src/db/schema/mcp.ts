import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { user } from "./auth.ts"
import { timestampNow } from "./columns.ts"

/**
 * Personal API tokens for the MCP server. Only the SHA-256 hash of a token is stored (the
 * plaintext is shown once at creation); deleting the user deletes their tokens.
 */
export const mcpToken = sqliteTable(
	"mcp_token",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		tokenHash: text("token_hash").notNull().unique(),
		lastFour: text("last_four").notNull(),
		createdAt: timestampNow("created_at"),
		lastUsedAt: text("last_used_at"),
	},
	(table) => [index("mcp_token_user").on(table.userId)]
)
