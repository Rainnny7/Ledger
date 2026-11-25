import { Elysia } from "elysia"
import { sessionUser } from "../session.ts"
import { z } from "zod"
import { boundedString, jsonBody } from "../../http/validation.ts"
import { and, eq, gt, isNull, or, sql } from "drizzle-orm"
import { db } from "../../db/connection.ts"
import { adviceDismissed } from "../../db/schema/index.ts"
import { todayIso } from "../../time/today.ts"

const dismissBody = z.object({
	id: boundedString(300).min(1),
	days: z.number().int().min(1).max(366).optional(),
})

const dismissedQuery = z.object({
	id: boundedString(300).min(1).optional(),
})

/** Elysia plugin wiring HTTP handlers for this area. */
export const adviceRoutes = new Elysia({ name: "finance-advice" }).use(
	sessionUser
)

adviceRoutes.get("/advice/dismissed", ({ user }) => {
	const rows = db
		.select({ id: adviceDismissed.tipId, until: adviceDismissed.until })
		.from(adviceDismissed)
		.where(
			and(
				eq(adviceDismissed.userId, user.id),
				or(
					isNull(adviceDismissed.until),
					gt(adviceDismissed.until, todayIso())
				)
			)
		)
		.all()
	return { dismissed: rows }
})

adviceRoutes.post(
	"/advice/dismiss",
	({ user, body }) => {
		let until: string | null = null
		if (body.days) {
			const today = new Date()
			today.setDate(today.getDate() + body.days)
			until = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
		}
		db.insert(adviceDismissed)
			.values({ userId: user.id, tipId: body.id, until })
			.onConflictDoUpdate({
				target: [adviceDismissed.userId, adviceDismissed.tipId],
				set: { until, createdAt: sql`datetime('now')` },
			})
			.run()
		return { ok: true }
	},
	{ body: jsonBody(dismissBody) }
)

adviceRoutes.delete(
	"/advice/dismissed",
	({ user, query }) => {
		const { id } = query
		db.delete(adviceDismissed)
			.where(
				id
					? and(
							eq(adviceDismissed.userId, user.id),
							eq(adviceDismissed.tipId, id)
						)
					: eq(adviceDismissed.userId, user.id)
			)
			.run()
		return { ok: true }
	},
	{ query: dismissedQuery }
)
