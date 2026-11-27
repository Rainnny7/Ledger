import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { CLIENT_IP_HEADER } from "../auth/hooks.ts"
import { auth } from "../auth/index.ts"
import { db } from "../db/connection.ts"
import { user } from "../db/schema/index.ts"
import { isDemoUserId } from "../demo/personas.ts"
import { apiErrors } from "../http/errors.ts"

/** Failed key attempts one address may make inside the window before it is turned away outright. */
const FAILURE_WINDOW_MS = 10 * 60 * 1000
const FAILURES_PER_WINDOW = 20
/** Most addresses remembered at once, so a flood of distinct addresses can't grow memory without bound. */
const TRACKED_ADDRESS_CAP = 5000

/** Longest key accepted before looking anything up (real keys are about 71 characters). */
const KEY_MAX_LENGTH = 200

const failuresByAddress = new Map<string, number[]>()

/** Failure times for one address inside the window, pruning the rest. */
function recentFailures(address: string): number[] {
	const now = Date.now()
	const recent = (failuresByAddress.get(address) ?? []).filter(
		(failureTime) => now - failureTime < FAILURE_WINDOW_MS
	)
	if (recent.length === 0) {
		failuresByAddress.delete(address)
	} else {
		failuresByAddress.set(address, recent)
	}
	return recent
}

/** Whether this address has failed too often recently, so key guessing is slowed to a crawl. */
function addressBlocked(address: string): boolean {
	return recentFailures(address).length >= FAILURES_PER_WINDOW
}

/** Remembers one failed attempt (bad key, or a key whose owner may not use the API). */
function recordFailure(address: string) {
	const recent = recentFailures(address)
	recent.push(Date.now())
	failuresByAddress.set(address, recent)
	if (failuresByAddress.size > TRACKED_ADDRESS_CAP) {
		for (const tracked of failuresByAddress.keys()) {
			if (recentFailures(tracked).length === 0) {
				continue
			}
			if (failuresByAddress.size <= TRACKED_ADDRESS_CAP) {
				break
			}
			failuresByAddress.delete(tracked)
		}
	}
}

/** Clears the per-address failure counts (tests). */
export function resetApiKeyFailures() {
	failuresByAddress.clear()
}

/** Pulls the key out of `Authorization: Bearer <key>` or `x-api-key`; null when absent or oversized. */
export function apiKeyFromRequest(request: Request): string | null {
	const bearer = /^Bearer\s+(\S+)$/i.exec(
		request.headers.get("authorization") ?? ""
	)
	const key = bearer?.[1] ?? request.headers.get("x-api-key")
	return key && key.length <= KEY_MAX_LENGTH ? key : null
}

/** Whether the key's owner may use the API right now: not blocked, not on a temporary password, not the demo user. */
function ownerMayUseApi(userId: string): boolean {
	const owner = db
		.select({
			banned: user.banned,
			banExpires: user.banExpires,
			mustChangePassword: user.mustChangePassword,
		})
		.from(user)
		.where(eq(user.id, userId))
		.get()
	if (!owner || isDemoUserId(userId) || owner.mustChangePassword) {
		return false
	}
	const banLifted =
		owner.banExpires !== null && new Date(owner.banExpires) <= new Date()
	return !owner.banned || banLifted
}

const UNAUTHORIZED = {
	error: "Unauthorized",
}

/**
 * API-key access to the REST API: provides `userId` (the key's owner) to every handler, and
 * answers 401 for a missing, unknown, expired, disabled or revoked key, or one whose owner may not
 * use the API (all identical, so nothing leaks about why), and 429 with Retry-After when the
 * key's own rate limit or this address's failed-attempt limit is hit. Responses are never cached.
 * The key itself is never logged.
 */
export const apiKeyUser = new Elysia({ name: "api-key-user" })
	.use(apiErrors)
	.derive({ as: "scoped" }, async ({ request, set, status }) => {
		set.headers["cache-control"] = "no-store"
		const address = request.headers.get(CLIENT_IP_HEADER) ?? "unknown"
		if (addressBlocked(address)) {
			set.headers["retry-after"] = String(
				Math.ceil(FAILURE_WINDOW_MS / 1000)
			)
			return status(429, {
				error: "Too many failed attempts. Try again later.",
			}) as never
		}
		const key = apiKeyFromRequest(request)
		if (!key) {
			set.headers["www-authenticate"] = 'Bearer realm="ledger"'
			return status(401, UNAUTHORIZED) as never
		}
		const result = await auth.api.verifyApiKey({ body: { key } })
		const error = result.error as {
			code?: string
			details?: { tryAgainIn?: number }
		} | null
		if (error?.code === "RATE_LIMITED") {
			set.headers["retry-after"] = String(
				Math.max(
					1,
					Math.ceil((error.details?.tryAgainIn ?? 1000) / 1000)
				)
			)
			return status(429, {
				error: "Too many requests. Try again shortly.",
			}) as never
		}
		if (
			!result.valid ||
			!result.key ||
			!ownerMayUseApi(result.key.referenceId)
		) {
			recordFailure(address)
			set.headers["www-authenticate"] = 'Bearer realm="ledger"'
			return status(401, UNAUTHORIZED) as never
		}
		return { userId: result.key.referenceId }
	})
