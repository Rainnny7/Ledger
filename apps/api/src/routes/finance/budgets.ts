import { Elysia } from "elysia"
import { sessionUser } from "../session.ts"
import { z } from "zod"
import { currencyCode, jsonBody, money } from "../../http/validation.ts"
import { CATEGORIES } from "@ledger/shared/categories"
import { fromCents, toCents } from "@ledger/shared/money"
import { and, asc, eq, sql } from "drizzle-orm"
import { db } from "../../db/connection.ts"
import { budget } from "../../db/schema/index.ts"
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
		.select({
			category: budget.category,
			amount: budget.amount,
			currency: budget.currency,
			updatedAt: budget.updatedAt,
		})
		.from(budget)
		.where(eq(budget.userId, user.id))
		.orderBy(asc(budget.category))
		.all()
		.map((row) => ({ ...row, amount: fromCents(row.amount) }))
	return { budgets }
})

budgetRoutes.put(
	"/budgets/:category",
	({ user, params, body }) => {
		const { category } = params

		db.insert(budget)
			.values({
				userId: user.id,
				category,
				amount: toCents(body.amount),
				currency: body.currency,
			})
			.onConflictDoUpdate({
				target: [budget.userId, budget.category],
				set: {
					amount: sql`excluded.amount`,
					currency: sql`excluded.currency`,
					updatedAt: sql`datetime('now')`,
				},
			})
			.run()
		return { ok: true }
	},
	{ params: categoryParam, body: jsonBody(budgetBody) }
)

budgetRoutes.delete(
	"/budgets/:category",
	({ user, params }) => {
		const { category } = params
		db.delete(budget)
			.where(
				and(eq(budget.userId, user.id), eq(budget.category, category))
			)
			.run()
		return { ok: true }
	},
	{ params: categoryParam }
)
