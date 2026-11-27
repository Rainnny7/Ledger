import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "../config/env.ts"

/** What a signed token may be used for. Part of the signed message, so a token for one purpose never works for another. */
export type TokenPurpose = "digest-unsubscribe"

/** Domain-separation label: keeps these signatures distinct from anything else derived from APP_SECRET. */
const KEY_LABEL = "ledger-signed-token-v1"

function signature(
	purpose: TokenPurpose,
	userId: string,
	secret: string
): Buffer {
	return createHmac("sha256", `${KEY_LABEL}:${secret}`)
		.update(`${purpose}:${userId}`)
		.digest()
}

/**
 * Signs a login-free link token proving the bearer was handed it for `purpose` and `userId`.
 * The token never expires (an unsubscribe link in an old email has to keep working) and can only
 * be used for that one purpose.
 *
 * @param secret Signing secret; defaults to the app secret (tests pass their own).
 */
export function signToken(
	purpose: TokenPurpose,
	userId: string,
	secret: string = env.APP_SECRET
): string {
	const encodedUser = Buffer.from(userId, "utf8").toString("base64url")
	return `${encodedUser}.${signature(purpose, userId, secret).toString("base64url")}`
}

/** The user id inside a token from {@link signToken}, or null when it's malformed, forged or for another purpose. */
export function verifyToken(
	purpose: TokenPurpose,
	token: string,
	secret: string = env.APP_SECRET
): string | null {
	const parts = token.split(".")
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return null
	}
	const userId = Buffer.from(parts[0], "base64url").toString("utf8")
	const given = Buffer.from(parts[1], "base64url")
	const expected = signature(purpose, userId, secret)
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		return null
	}
	return userId
}
