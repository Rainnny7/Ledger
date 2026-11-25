import { randomUUID } from "node:crypto"
import { z } from "zod"
import { currencyCode, isoDate } from "../../validation.ts"
import { db } from "../../db.ts"
import { todayIso } from "../../today.ts"
import {
  GOAL_KINDS,
  type GoalPaymentRow,
  type GoalRow,
  summarizeGoal,
} from "../../finance/goals.ts"
import {
  access,
  canEdit,
  forgetItem,
  listWithShared,
  viewOne,
} from "../../sharing.ts"
import { loadTransactions } from "./transactions.ts"
import type { Hono } from "hono"
import type { Vars } from "./types.ts"

const GOAL_COLS = `id, name, kind, target, currency, target_date AS targetDate, icon, color, notes, archived, created_at AS createdAt`

function loadGoals(userId: string, id?: string) {
  const goals = (id
    ? db
        .prepare(`SELECT ${GOAL_COLS} FROM goal WHERE user_id = ? AND id = ?`)
        .all(userId, id)
    : db
        .prepare(
          `SELECT ${GOAL_COLS} FROM goal WHERE user_id = ? ORDER BY created_at`
        )
        .all(userId)) as unknown as (Omit<GoalRow, "archived"> & {
    archived: number
  })[]
  if (goals.length === 0) return []
  const payments = db
    .prepare(
      `SELECT p.id, p.goal_id AS goalId, p.amount, p.date, p.note, p.transaction_id AS transactionId, p.created_at AS createdAt
         FROM goal_payment p JOIN goal g ON g.id = p.goal_id WHERE g.user_id = ?`
    )
    .all(userId) as unknown as GoalPaymentRow[]
  const today = todayIso()
  return goals.map((g) =>
    summarizeGoal(
      { ...g, archived: Boolean(g.archived) },
      payments.filter((p) => p.goalId === g.id),
      today
    )
  )
}

const goalFor = (ownerId: string, id: string) => loadGoals(ownerId, id)[0]
const viewGoal = (userId: string, id: string) =>
  viewOne("goal", userId, id, goalFor)

export function mountGoals(finance: Hono<Vars>) {
  finance.get("/goals", (c) =>
    c.json({
      goals: listWithShared("goal", c.var.user.id, loadGoals, goalFor),
    })
  )

  const goalBody = z.object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(GOAL_KINDS).default("save"),
    target: z.number().positive().max(100_000_000),
    currency: currencyCode.default("CAD"),
    targetDate: isoDate.nullable().optional(),
    icon: z
      .string()
      .regex(/^[a-z-]{1,32}$/)
      .default("target"),
    color: z
      .string()
      .regex(/^[a-z-]{1,32}$/)
      .default("sunset"),
    notes: z.string().max(500).nullable().optional(),
    archived: z.boolean().default(false),
    /** Money already put aside when the goal is created; logged as the first payment. */
    startingAmount: z.number().min(0).max(100_000_000).optional(),
  })

  finance.post("/goals", async (c) => {
    const body = goalBody.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: "Check the goal details." }, 400)
    const d = body.data
    const id = randomUUID()
    db.prepare(
      `INSERT INTO goal (id, user_id, name, kind, target, currency, target_date, icon, color, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      c.var.user.id,
      d.name,
      d.kind,
      d.target,
      d.currency.toUpperCase(),
      d.targetDate ?? null,
      d.icon,
      d.color,
      d.notes?.trim() || null,
      d.archived ? 1 : 0
    )
    if (d.startingAmount && d.startingAmount > 0) {
      db.prepare(
        `INSERT INTO goal_payment (id, goal_id, amount, date, note) VALUES (?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        id,
        d.startingAmount,
        todayIso(),
        d.kind === "payoff" ? "Already paid" : "Already saved"
      )
    }
    return c.json({ goal: viewGoal(c.var.user.id, id) })
  })

  finance.patch("/goals/:id", async (c) => {
    const body = goalBody
      .omit({ startingAmount: true })
      .partial()
      .safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: "Check the goal details." }, 400)
    const a = access(c.var.user.id, "goal", c.req.param("id"))
    if (!a) return c.json({ error: "Not found" }, 404)
    if (!canEdit(a))
      return c.json({ error: "You can only view this goal." }, 403)
    // Archiving hides it for everyone, so that's the owner's call.
    if (a.role !== "owner") delete body.data.archived
    const cols: Record<string, string> = {
      name: "name",
      kind: "kind",
      target: "target",
      currency: "currency",
      targetDate: "target_date",
      icon: "icon",
      color: "color",
      notes: "notes",
      archived: "archived",
    }
    const sets: string[] = []
    const vals: (string | number | null)[] = []
    for (const [k, col] of Object.entries(cols)) {
      const v = (body.data as Record<string, unknown>)[k]
      if (v === undefined) continue
      sets.push(`${col} = ?`)
      vals.push(
        typeof v === "boolean"
          ? v
            ? 1
            : 0
          : k === "notes"
            ? (v as string | null)?.trim() || null
            : (v as string | number | null)
      )
    }
    if (sets.length) {
      db.prepare(
        `UPDATE goal SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
      ).run(...vals, c.req.param("id"), a.ownerId)
    }
    const goal = viewGoal(c.var.user.id, c.req.param("id"))
    return goal ? c.json({ goal }) : c.json({ error: "Not found" }, 404)
  })

  finance.delete("/goals/:id", (c) => {
    const r = db
      .prepare(`DELETE FROM goal WHERE id = ? AND user_id = ?`)
      .run(c.req.param("id"), c.var.user.id)
    if (r.changes) forgetItem("goal", c.req.param("id"))
    return r.changes
      ? c.json({ ok: true })
      : c.json({ error: "Not found" }, 404)
  })

  const paymentBody = z.object({
    /** Positive toward the goal; negative to take money back out. */
    amount: z
      .number()
      .refine((n) => n !== 0, "Amount can’t be zero")
      .refine((n) => Math.abs(n) <= 100_000_000),
    date: isoDate,
    note: z.string().max(200).nullable().optional(),
    /** Optionally the bank transaction this payment was (e.g. the transfer to savings). */
    transactionId: z.string().max(80).nullable().optional(),
  })

  /** Owners and people it's shared with for editing can log payments. */
  const canEditGoal = (userId: string, goalId: string) =>
    canEdit(access(userId, "goal", goalId))

  finance.post("/goals/:id/payments", async (c) => {
    const body = paymentBody.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success)
      return c.json({ error: "Check the payment details." }, 400)
    const userId = c.var.user.id
    const goalId = c.req.param("id")
    if (!canEditGoal(userId, goalId)) return c.json({ error: "Not found" }, 404)
    const d = body.data
    if (
      d.transactionId &&
      loadTransactions(userId, { id: d.transactionId }).length === 0
    )
      return c.json({ error: "Unknown transaction" }, 400)
    db.prepare(
      `INSERT INTO goal_payment (id, goal_id, amount, date, note, transaction_id) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      goalId,
      Math.round(d.amount * 100) / 100,
      d.date,
      d.note?.trim() || null,
      d.transactionId ?? null
    )
    return c.json({ goal: viewGoal(userId, goalId) })
  })

  finance.delete("/goals/:id/payments/:pid", (c) => {
    const userId = c.var.user.id
    const goalId = c.req.param("id")
    if (!canEditGoal(userId, goalId)) return c.json({ error: "Not found" }, 404)
    const r = db
      .prepare(`DELETE FROM goal_payment WHERE id = ? AND goal_id = ?`)
      .run(c.req.param("pid"), goalId)
    return r.changes
      ? c.json({ goal: viewGoal(userId, goalId) })
      : c.json({ error: "Not found" }, 404)
  })
}
