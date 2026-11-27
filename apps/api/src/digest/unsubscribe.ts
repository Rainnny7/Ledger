import { eq } from "drizzle-orm"
import { env } from "../config/env.ts"
import { db } from "../db/connection.ts"
import { user } from "../db/schema/index.ts"
import { signToken, verifyToken } from "../security/signed-token.ts"

/** Public path of the digest unsubscribe endpoint (GET confirms, POST unsubscribes). */
export const DIGEST_UNSUBSCRIBE_PATH = "/api/public/digest/unsubscribe"

/** The login-free link that turns one user's digest off; goes in the footer and List-Unsubscribe header. */
export function digestUnsubscribeUrl(userId: string): string {
	const token = signToken("digest-unsubscribe", userId)
	return `${env.PUBLIC_URL}${DIGEST_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`
}

/**
 * Turns the digest off for the user a token was signed for.
 *
 * @returns False when the token is invalid or the user no longer exists.
 */
export function unsubscribeFromDigest(token: string): boolean {
	const userId = verifyToken("digest-unsubscribe", token)
	if (!userId) {
		return false
	}
	const updated = db
		.update(user)
		.set({ spendingDigest: "off" })
		.where(eq(user.id, userId))
		.returning({ id: user.id })
		.all()
	return updated.length > 0
}

/** Whether a token is valid, without acting on it (for the GET confirm page). */
export const isValidDigestUnsubscribeToken = (token: string) =>
	verifyToken("digest-unsubscribe", token) !== null
