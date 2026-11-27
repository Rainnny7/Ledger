import { count, eq } from "drizzle-orm"
import { db } from "../db/connection.ts"
import { apikey } from "../db/schema/index.ts"

/** Recognisable start of every personal API key (also makes leaked keys greppable by secret scanners). */
export const API_KEY_PREFIX = "ledger_"

/** Most API keys one user may hold at once. */
export const MAX_API_KEYS_PER_USER = 10

/** Longest key name accepted. */
export const API_KEY_NAME_MAX = 60

/** Per-key request allowance: this many requests in each window, then 429 until the window resets. */
export const API_KEY_RATE_LIMIT_MAX = 60
export const API_KEY_RATE_LIMIT_WINDOW_MS = 60 * 1000

/** Expiry choices a client may ask for, in days (the plugin's own bounds are 1 to 365; "never" is no expiry). */
export const API_KEY_MAX_EXPIRY_DAYS = 365

/** Where the REST API lives. Authenticated by API key only, never by cookie. */
export const API_V1_PATH = "/api/v1"

/** How many keys a user holds right now. */
export function countApiKeys(userId: string): number {
	return (
		db
			.select({ total: count() })
			.from(apikey)
			.where(eq(apikey.referenceId, userId))
			.get()?.total ?? 0
	)
}
