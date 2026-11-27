import { Elysia } from "elysia"
import { z } from "zod"
import { escapeHtml } from "../mail/html.ts"
import {
	sendSpendingDigest,
	spendingDigestAvailable,
} from "../digest/service.ts"
import {
	DIGEST_UNSUBSCRIBE_PATH,
	isValidDigestUnsubscribeToken,
	unsubscribeFromDigest,
} from "../digest/unsubscribe.ts"
import { sessionUser } from "./session.ts"

/** The "send me a test digest" button can't be mashed: each send costs an AI call and an email. */
const TEST_COOLDOWN_MS = 60_000
const lastTestAt = new Map<string, number>()

/** Logged-in digest routes (mounted under `/api/banks`). */
export const digestRoutes = new Elysia({ name: "digest-routes" }).use(
	sessionUser
)

digestRoutes.post("/digest/test", async ({ user, status }) => {
	if (!spendingDigestAvailable()) {
		return status(503, {
			error: "The spending digest needs outgoing email and AI set up on this server.",
		})
	}
	const last = lastTestAt.get(user.id) ?? 0
	if (Date.now() - last < TEST_COOLDOWN_MS) {
		return status(429, {
			error: "A test digest was just sent. Try again in a minute.",
		})
	}
	lastTestAt.set(user.id, Date.now())
	try {
		const result = await sendSpendingDigest(user.id, { force: true })
		if (result.status === "skipped") {
			return status(400, {
				error: "There are no transactions from last month to summarise yet.",
			})
		}
		return { ok: true, period: result.period }
	} catch (error) {
		lastTestAt.delete(user.id)
		return status(502, {
			error:
				error instanceof Error && error.message
					? error.message
					: "The email could not be sent.",
		})
	}
})

const unsubscribeQuery = z.object({ token: z.string().max(500) })

const page = (title: string, body: string, statusCode = 200) =>
	new Response(
		`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;line-height:1.5;color:#111}button{font:inherit;padding:.5rem 1rem;border-radius:.5rem;border:0;background:#4f46e5;color:#fff;cursor:pointer}</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`,
		{
			status: statusCode,
			headers: {
				"content-type": "text/html; charset=utf-8",
				"cache-control": "no-store",
			},
		}
	)

/**
 * Login-free digest unsubscribe (mounted under `/api/public`). GET only shows a confirm page, so
 * mail scanners that prefetch links can't unsubscribe anyone; POST (the confirm button, or a mail
 * client's RFC 8058 one-click request) does the work.
 */
export const publicDigest = new Elysia({ name: "public-digest" })
	.get(
		DIGEST_UNSUBSCRIBE_PATH.replace("/api/public", ""),
		({ query }) => {
			if (!isValidDigestUnsubscribeToken(query.token)) {
				return page(
					"Link not valid",
					"<p>This unsubscribe link isn't valid. You can turn the digest off in Ledger under Settings.</p>",
					400
				)
			}
			return page(
				"Unsubscribe from the monthly digest?",
				`<form method="post" action="${escapeHtml(`${DIGEST_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(query.token)}`)}"><button type="submit">Unsubscribe</button></form>`
			)
		},
		{ query: unsubscribeQuery }
	)
	.post(
		DIGEST_UNSUBSCRIBE_PATH.replace("/api/public", ""),
		({ query }) => {
			if (!unsubscribeFromDigest(query.token)) {
				return page(
					"Link not valid",
					"<p>This unsubscribe link isn't valid. You can turn the digest off in Ledger under Settings.</p>",
					400
				)
			}
			return page(
				"You're unsubscribed",
				"<p>You won't get the monthly spending digest any more. You can turn it back on in Ledger under Settings.</p>"
			)
		},
		{ query: unsubscribeQuery }
	)
