import { z } from "zod"
import { currencyCode } from "../../validation.ts"
import { CATEGORIES } from "../../../shared/categories.ts"
import { db } from "../../db.ts"
import { getRates } from "../../fx.ts"
import type { Hono } from "hono"
import type { Vars } from "./types.ts"

export function mountBudgets(finance: Hono<Vars>) {
  finance.get("/fx", async (c) => c.json(await getRates()))

  /** Monthly spending limits per category. */
  finance.get("/budgets", (c) => {
    const budgets = db
      .prepare(
        `SELECT category, amount, currency, updated_at AS updatedAt FROM budget WHERE user_id = ? ORDER BY category`
      )
      .all(c.var.user.id)
    return c.json({ budgets })
  })

  finance.put("/budgets/:category", async (c) => {
    const category = z.enum(CATEGORIES).safeParse(c.req.param("category"))
    const body = z
      .object({
        amount: z.number().positive().max(1e9),
        currency: currencyCode,
      })
      .safeParse(await c.req.json().catch(() => ({})))
    if (!category.success || !body.success)
      return c.json({ error: "Invalid budget" }, 400)
    db.prepare(
      `INSERT INTO budget (user_id, category, amount, currency) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, category) DO UPDATE SET amount = excluded.amount, currency = excluded.currency, updated_at = datetime('now')`
    ).run(
      c.var.user.id,
      category.data,
      Math.round(body.data.amount * 100) / 100,
      body.data.currency
    )
    return c.json({ ok: true })
  })

  finance.delete("/budgets/:category", (c) => {
    db.prepare(`DELETE FROM budget WHERE user_id = ? AND category = ?`).run(
      c.var.user.id,
      c.req.param("category")
    )
    return c.json({ ok: true })
  })
}
