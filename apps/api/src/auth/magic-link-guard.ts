import type { BetterAuthPlugin } from "better-auth"
import { createAuthMiddleware, APIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { db } from "../db/connection.ts"
import { user } from "../db/schema/index.ts"
import { isSmtpConfigured } from "../mail/smtp.ts"
import { userHasCredentialPassword } from "./credentials.ts"
import { emailResendCooldownBlocked } from "./hooks.ts"

/** Cooldown bucket shared with the code that records a sent login link. */
export const MAGIC_LINK_COOLDOWN_KIND = "magic-link"

/**
 * Gatekeeper for login-link requests. It is a plugin, registered after the captcha plugin, so the
 * answers below (which hint at whether an address has an account) only go to callers who passed the
 * captcha.
 *
 * Requests that must not send anything (a cooldown still running, or a new address while sign-ups are
 * closed) get the same `{ status: true }` a real send gets, so the response never reveals which case it
 * was and nobody can use the cooldown to find out whether an address is registered.
 *
 * @param options.registrationOpen Whether people may currently sign themselves up.
 */
export function magicLinkGuard(options: {
	registrationOpen: () => boolean
}): BetterAuthPlugin {
	return {
		id: "ledger-magic-link-guard",
		hooks: {
			before: [
				{
					matcher: (context) =>
						context.path === "/sign-in/magic-link",
					handler: createAuthMiddleware(async (context) => {
						if (!isSmtpConfigured()) {
							throw new APIError("BAD_REQUEST", {
								message:
									"Email login links are not available on this server.",
							})
						}
						const requested = (
							context.body as { email?: unknown } | undefined
						)?.email
						if (typeof requested !== "string") {
							return
						}
						const email = requested.trim().toLowerCase()
						const existing = db
							.select({
								id: user.id,
								emailVerified: user.emailVerified,
							})
							.from(user)
							.where(eq(user.email, email))
							.get()
						// An unverified password account may belong to someone who only claimed the address.
						if (
							existing &&
							!existing.emailVerified &&
							userHasCredentialPassword(existing.id)
						) {
							throw new APIError("BAD_REQUEST", {
								code: "EMAIL_NOT_VERIFIED",
								message:
									"Verify your email first. Logging in with your password sends a new verification link.",
							})
						}
						if (
							emailResendCooldownBlocked(
								MAGIC_LINK_COOLDOWN_KIND,
								email
							) ||
							(!existing && !options.registrationOpen())
						) {
							return context.json({ status: true })
						}
					}),
				},
			],
		},
	}
}
