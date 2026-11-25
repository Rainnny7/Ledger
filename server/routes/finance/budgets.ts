import { z } from "zod"
import { currencyCode, money, validate } from "../../validation.ts"
import { CATEGORIES } from "../../../shared/categories.ts"
import { fromCents, toCents } from "../../../shared/money.ts"
import { db } from "../../db.ts"
import { getRates } from "../../fx.ts"
import type { Hono } from "hono"
import type { Vars } from "./types.ts"

const categoryParam = z.object({ category: z.enum(CATEGORIES) })
const budgetBody = z.object({
  amount: money.refine((n) => n > 0, "Amount must be positive"),
  currency: currencyCode,
})

export function mountBudgets(finance: Hono<Vars>) {
  finance.get("/fx", async (c) => c.json(await getRates()))

  finance.get("/budgets", (c) => {
    const budgets = db
      .prepare(
        `SELECT category, amount, currency, updated_at AS updatedAt FROM budget WHERE user_id = ? ORDER BY category`
      )
      .all(c.var.user.id)
      .map((b) => ({ ...b, amount: fromCents(b.amount as number) }))
    return c.json({ budgets })
  })

  finance.put(
    "/budgets/:category",
    validate("param", categoryParam),
    validate("json", budgetBody),
    (c) => {
      const { category } = c.req.valid("param")
      const body = c.req.valid("json")
      db.prepare(
        `INSERT INTO budget (user_id, category, amount, currency) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, category) DO UPDATE SET amount = excluded.amount, currency = excluded.currency, updated_at = datetime('now')`
      ).run(c.var.user.id, category, toCents(body.amount), body.currency)
      return c.json({ ok: true })
    }
  )

  finance.delete(
    "/budgets/:category",
    validate("param", categoryParam),
    (c) => {
      const { category } = c.req.valid("param")
      db.prepare(`DELETE FROM budget WHERE user_id = ? AND category = ?`).run(
        c.var.user.id,
        category
      )
      return c.json({ ok: true })
    }
  )
}
