import { z } from "zod"
import { db } from "../../db.ts"
import { todayIso } from "../../today.ts"
import type { Hono } from "hono"
import type { Vars } from "./types.ts"

export function mountAdvice(finance: Hono<Vars>) {
  finance.get("/advice/dismissed", (c) => {
    const rows = db
      .prepare(
        `SELECT tip_id AS id, until FROM advice_dismissed WHERE user_id = ? AND (until IS NULL OR until > ?)`
      )
      .all(c.var.user.id, todayIso()) as { id: string; until: string | null }[]
    return c.json({ dismissed: rows })
  })

  finance.post("/advice/dismiss", async (c) => {
    // `days` snoozes the tip; without it the tip stays hidden for good.
    const body = z
      .object({
        id: z.string().min(1).max(300),
        days: z.number().int().min(1).max(366).optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: "Invalid request" }, 400)
    let until: string | null = null
    if (body.data.days) {
      const d = new Date()
      d.setDate(d.getDate() + body.data.days)
      until = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    }
    db.prepare(
      `INSERT INTO advice_dismissed (user_id, tip_id, until) VALUES (?, ?, ?)
     ON CONFLICT (user_id, tip_id) DO UPDATE SET until = excluded.until, created_at = datetime('now')`
    ).run(c.var.user.id, body.data.id, until)
    return c.json({ ok: true })
  })

  /** Brings one hidden tip back (`?id=`), or all of them. */
  finance.delete("/advice/dismissed", (c) => {
    const id = c.req.query("id")
    if (id)
      db.prepare(
        `DELETE FROM advice_dismissed WHERE user_id = ? AND tip_id = ?`
      ).run(c.var.user.id, id)
    else
      db.prepare(`DELETE FROM advice_dismissed WHERE user_id = ?`).run(
        c.var.user.id
      )
    return c.json({ ok: true })
  })
}
