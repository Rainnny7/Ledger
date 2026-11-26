/** POST /api/auth/lookup: tells the login page whether to ask for a password or offer sign-up. */
import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { z } from "zod"
import { db } from "../db/connection.ts"
import { user } from "../db/schema/index.ts"
import { isDemoEmail } from "../demo/personas.ts"
import { jsonBody } from "../http/validation.ts"
import { CLIENT_IP_HEADER, isPlausibleEmail } from "./hooks.ts"

/** Lookups allowed per address per window; generous for a person, tight for a scraper. */
const LOOKUP_MAX = 10
const LOOKUP_WINDOW_MS = 60_000
const LOOKUP_TRACKED_CAP = 5000

const lookupBody = z.object({ email: z.string().max(254) })

/** What the lookup needs from the rest of the server. */
export type AuthLookupOptions = {
	/** Whether people may sign themselves up right now. */
	registrationOpen: () => boolean
	/** Checks the Turnstile token; omit when captcha is off. */
	verifyCaptcha?: (token: string, ip: string | null) => Promise<boolean>
}

/**
 * Builds the lookup route. It lets the single login page choose between "log in" and "sign up".
 *
 * Tradeoff, accepted: answering whether an email has an account allows account enumeration. It is
 * kept in check by the captcha (when configured) and a per-address rate limit. Demo addresses are
 * reported as having no account, and the database is queried either way so timing doesn't
 * distinguish them.
 */
export function authLookup(options: AuthLookupOptions) {
	const hits = new Map<string, number[]>()

	/** Counts this request against the caller's window; true when they're over the limit. */
	function limited(ip: string): boolean {
		const now = Date.now()
		const recent = (hits.get(ip) ?? []).filter(
			(hitTime) => now - hitTime < LOOKUP_WINDOW_MS
		)
		recent.push(now)
		hits.set(ip, recent)
		if (hits.size > LOOKUP_TRACKED_CAP) {
			for (const [key, times] of hits) {
				if (
					times.every((hitTime) => now - hitTime >= LOOKUP_WINDOW_MS)
				) {
					hits.delete(key)
				}
			}
		}
		return recent.length > LOOKUP_MAX
	}

	return new Elysia({ name: "auth-lookup" }).post(
		"/api/auth/lookup",
		async ({ body, request, status }) => {
			const ip = request.headers.get(CLIENT_IP_HEADER)
			if (limited(ip ?? "unknown")) {
				return status(429, {
					error: "Too many attempts. Try again in a minute.",
				})
			}
			if (options.verifyCaptcha) {
				const token = request.headers.get("x-captcha-response")
				if (!token || !(await options.verifyCaptcha(token, ip))) {
					return status(403, {
						error: "Captcha verification failed",
						code: "CAPTCHA_FAILED",
					})
				}
			}
			if (!isPlausibleEmail(body.email)) {
				return status(400, { error: "Enter a valid email address." })
			}
			const email = body.email.trim().toLowerCase()
			const found = db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, email))
				.get()
			return {
				exists: Boolean(found) && !isDemoEmail(email),
				registrationOpen: options.registrationOpen(),
			}
		},
		{ body: jsonBody(lookupBody) }
	)
}
