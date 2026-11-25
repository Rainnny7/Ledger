import { z } from "zod"
import { boundedString, validate } from "../../validation.ts"
import { db } from "../../db.ts"
import { todayIso } from "../../today.ts"
import type { Hono } from "hono"
import type { Vars } from "./types.ts"

const dismissBody = z.object({
  id: boundedString(300).min(1),
  days: z.number().int().min(1).max(366).optional(),
})

const dismissedQuery = z.object({
  id: boundedString(300).min(1).optional(),
})

export function mountAdvice(finance: Hono<Vars>) {
  finance.get("/advice/dismissed", (c) => {
    const rows = db
      .prepare(
        `SELECT tip_id AS id, until FROM advice_dismissed WHERE user_id = ? AND (until IS NULL OR until > ?)`
      )
      .all(c.var.user.id, todayIso()) as { id: string; until: string | null }[]
    return c.json({ dismissed: rows })
  })

  finance.post("/advice/dismiss", validate("json", dismissBody), (c) => {
    const body = c.req.valid("json")
    let until: string | null = null
    if (body.days) {
      const d = new Date()
      d.setDate(d.getDate() + body.days)
      until = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    }
    db.prepare(
      `INSERT INTO advice_dismissed (user_id, tip_id, until) VALUES (?, ?, ?)
     ON CONFLICT (user_id, tip_id) DO UPDATE SET until = excluded.until, created_at = datetime('now')`
    ).run(c.var.user.id, body.id, until)
    return c.json({ ok: true })
  })

  finance.delete(
    "/advice/dismissed",
    validate("query", dismissedQuery),
    (c) => {
      const { id } = c.req.valid("query")
      if (id)
        db.prepare(
          `DELETE FROM advice_dismissed WHERE user_id = ? AND tip_id = ?`
        ).run(c.var.user.id, id)
      else
        db.prepare(`DELETE FROM advice_dismissed WHERE user_id = ?`).run(
          c.var.user.id
        )
      return c.json({ ok: true })
    }
  )
}
