import { Elysia } from "elysia"
import { sessionUser } from "../session.ts"
import { z } from "zod"
import { currencyCode, jsonBody, money } from "../../http/validation.ts"
import { CATEGORIES } from "../../../shared/categories.ts"
import { fromCents, toCents } from "../../../shared/money.ts"
import { db } from "../../db/connection.ts"
import { getRates } from "../../fx/rates.ts"

const categoryParam = z.object({ category: z.enum(CATEGORIES) })
const budgetBody = z.object({
	amount: money.refine((amount) => amount > 0, "Amount must be positive"),
	currency: currencyCode,
})

/** Elysia plugin wiring HTTP handlers for this area. */
export const budgetRoutes = new Elysia({ name: "finance-budgets" }).use(
	sessionUser
)

budgetRoutes.get("/fx", async () => await getRates())

budgetRoutes.get("/budgets", ({ user }) => {
	const budgets = db
		.prepare(
			`SELECT category, amount, currency, updated_at AS updatedAt FROM budget WHERE user_id = ? ORDER BY category`
		)
		.all(user.id)
		.map((budget) => ({
			...(budget as Record<string, unknown>),
			amount: fromCents((budget as { amount: number }).amount),
		}))
	return { budgets }
})

budgetRoutes.put(
	"/budgets/:category",
	({ user, params, body }) => {
		const { category } = params

		db.prepare(
			`INSERT INTO budget (user_id, category, amount, currency) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, category) DO UPDATE SET amount = excluded.amount, currency = excluded.currency, updated_at = datetime('now')`
		).run(user.id, category, toCents(body.amount), body.currency)
		return { ok: true }
	},
	{ params: categoryParam, body: jsonBody(budgetBody) }
)

budgetRoutes.delete(
	"/budgets/:category",
	({ user, params }) => {
		const { category } = params
		db.prepare(`DELETE FROM budget WHERE user_id = ? AND category = ?`).run(
			user.id,
			category
		)
		return { ok: true }
	},
	{ params: categoryParam }
)
