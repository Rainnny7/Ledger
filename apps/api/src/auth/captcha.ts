/** Cloudflare Turnstile: the server-side check shared by Better Auth's captcha plugin config and the email lookup. */
import { env } from "../config/env.ts"

/** Cloudflare's token verification endpoint. */
const SITEVERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** Matches Better Auth's own verification deadline; a hanging Cloudflare must not hang login. */
const VERIFY_TIMEOUT_MS = 10_000

/** Turnstile secret, set only when captcha is switched on (both keys present). */
export const turnstileSecretKey =
	env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY
		? env.TURNSTILE_SECRET_KEY
		: null

/** The public site key the login page needs to render the widget; null when captcha is off. */
export const turnstileSiteKey = turnstileSecretKey
	? (env.TURNSTILE_SITE_KEY ?? null)
	: null

/**
 * Asks Cloudflare whether a Turnstile token is genuine. Tokens are single-use, so a token verified
 * here can't also be sent to another protected endpoint. Any failure (network, timeout, rejection)
 * counts as "not verified".
 *
 * @param secretKey The Turnstile secret.
 * @param token The token the browser got from the widget.
 * @param remoteIp The visitor's address, which Cloudflare uses as an extra signal.
 * @param fetchImplementation Replaceable in tests.
 */
export async function verifyTurnstileToken(
	secretKey: string,
	token: string,
	remoteIp: string | null,
	fetchImplementation: typeof fetch = fetch
): Promise<boolean> {
	try {
		const response = await fetchImplementation(SITEVERIFY_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				secret: secretKey,
				response: token,
				...(remoteIp ? { remoteip: remoteIp } : {}),
			}),
			signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
		})
		if (!response.ok) {
			return false
		}
		const result = (await response.json()) as { success?: unknown }
		return result.success === true
	} catch (error) {
		console.error("[captcha] could not reach Turnstile", error)
		return false
	}
}

/** Checks a token with the configured secret; undefined when captcha is off, so callers skip the check. */
export const verifyCaptcha = turnstileSecretKey
	? (token: string, remoteIp: string | null) =>
			verifyTurnstileToken(turnstileSecretKey, token, remoteIp)
	: undefined
