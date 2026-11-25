import { Elysia } from "elysia"
import { sessionUser } from "../session.ts"
import { z } from "zod"
import { boundedString, jsonBody } from "../../http/validation.ts"
import { db } from "../../db/connection.ts"
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
		.prepare(
			`SELECT tip_id AS id, until FROM advice_dismissed WHERE user_id = ? AND (until IS NULL OR until > ?)`
		)
		.all(user.id, todayIso()) as {
		id: string
		until: string | null
	}[]
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
		db.prepare(
			`INSERT INTO advice_dismissed (user_id, tip_id, until) VALUES (?, ?, ?)
     ON CONFLICT (user_id, tip_id) DO UPDATE SET until = excluded.until, created_at = datetime('now')`
		).run(user.id, body.id, until)
		return { ok: true }
	},
	{ body: jsonBody(dismissBody) }
)

adviceRoutes.delete(
	"/advice/dismissed",
	({ user, query }) => {
		const { id } = query
		if (id) {
			db.prepare(
				`DELETE FROM advice_dismissed WHERE user_id = ? AND tip_id = ?`
			).run(user.id, id)
		} else {
			db.prepare(`DELETE FROM advice_dismissed WHERE user_id = ?`).run(
				user.id
			)
		}
		return { ok: true }
	},
	{ query: dismissedQuery }
)
