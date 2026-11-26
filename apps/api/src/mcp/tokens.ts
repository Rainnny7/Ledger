import { createHash, randomBytes, randomUUID } from "node:crypto"
import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm"
import { db } from "../db/connection.ts"
import { mcpToken, user } from "../db/schema/index.ts"

/** Prefix that makes a Ledger MCP token recognisable (and greppable by secret scanners). */
export const MCP_TOKEN_PREFIX = "ledger_mcp_"

/** Most tokens one user may hold at once. */
export const MAX_MCP_TOKENS_PER_USER = 10

/** `lastUsedAt` is only rewritten when it is older than this, so busy clients don't write on every call. */
const LAST_USED_THROTTLE_SECONDS = 5 * 60

/** A stored token as shown in the settings list (never includes the hash or the secret). */
export interface McpTokenSummary {
	id: string
	name: string
	lastFour: string
	createdAt: string
	lastUsedAt: string | null
}

/** SHA-256 hex digest of a raw token; the only form of it that is ever stored or compared. */
export function hashMcpToken(rawToken: string): string {
	return createHash("sha256").update(rawToken).digest("hex")
}

const summaryColumns = {
	id: mcpToken.id,
	name: mcpToken.name,
	lastFour: mcpToken.lastFour,
	createdAt: mcpToken.createdAt,
	lastUsedAt: mcpToken.lastUsedAt,
}

/** Lists a user's tokens, newest first. */
export function listMcpTokens(userId: string): McpTokenSummary[] {
	return db
		.select(summaryColumns)
		.from(mcpToken)
		.where(eq(mcpToken.userId, userId))
		.orderBy(desc(mcpToken.createdAt), desc(mcpToken.id))
		.all()
}

/**
 * Creates a token for a user. Returns null when they already hold the maximum; otherwise the
 * plaintext token (this is the only time it exists) and the stored row.
 */
export function createMcpToken(
	userId: string,
	name: string
): { token: string; row: McpTokenSummary } | null {
	const existing = db
		.select({ total: count() })
		.from(mcpToken)
		.where(eq(mcpToken.userId, userId))
		.get()
	if ((existing?.total ?? 0) >= MAX_MCP_TOKENS_PER_USER) {
		return null
	}
	const token = `${MCP_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
	const row = db
		.insert(mcpToken)
		.values({
			id: randomUUID(),
			userId,
			name,
			tokenHash: hashMcpToken(token),
			lastFour: token.slice(-4),
		})
		.returning(summaryColumns)
		.get()
	return { token, row }
}

/** Deletes one of the user's own tokens; false when it doesn't exist or belongs to someone else. */
export function revokeMcpToken(userId: string, tokenId: string): boolean {
	return (
		db
			.delete(mcpToken)
			.where(and(eq(mcpToken.id, tokenId), eq(mcpToken.userId, userId)))
			.returning({ id: mcpToken.id })
			.all().length > 0
	)
}

/** Why a bearer token was refused. */
export type McpTokenRejection = "invalid" | "password-change-required"

/**
 * Resolves a raw bearer token to its owner by hash lookup. Unknown, revoked and malformed tokens,
 * banned users, and users who still have to change a temporary password are all refused. A
 * successful lookup refreshes `lastUsedAt` (throttled).
 */
export function resolveMcpToken(
	rawToken: string
): { tokenId: string; userId: string } | McpTokenRejection {
	if (!rawToken.startsWith(MCP_TOKEN_PREFIX) || rawToken.length > 200) {
		return "invalid"
	}
	const row = db
		.select({
			tokenId: mcpToken.id,
			userId: mcpToken.userId,
			banned: user.banned,
			mustChangePassword: user.mustChangePassword,
		})
		.from(mcpToken)
		.innerJoin(user, eq(user.id, mcpToken.userId))
		.where(eq(mcpToken.tokenHash, hashMcpToken(rawToken)))
		.get()
	if (!row || row.banned) {
		return "invalid"
	}
	if (row.mustChangePassword) {
		return "password-change-required"
	}
	db.update(mcpToken)
		.set({ lastUsedAt: sql`datetime('now')` })
		.where(
			and(
				eq(mcpToken.id, row.tokenId),
				or(
					isNull(mcpToken.lastUsedAt),
					sql`${mcpToken.lastUsedAt} < datetime('now', ${`-${LAST_USED_THROTTLE_SECONDS} seconds`})`
				)
			)
		)
		.run()
	return { tokenId: row.tokenId, userId: row.userId }
}
