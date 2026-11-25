import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
  boundedString,
  currencyCode,
  id,
  isoDate,
  money,
  validate,
} from "../../validation.ts"
import { fromCents, toCents } from "../../../shared/money.ts"
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

function loadGoals(userId: string, goalId?: string) {
  const goals = (goalId
    ? db
        .prepare(`SELECT ${GOAL_COLS} FROM goal WHERE user_id = ? AND id = ?`)
        .all(userId, goalId)
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
      { ...g, target: fromCents(g.target), archived: Boolean(g.archived) },
      payments
        .filter((p) => p.goalId === g.id)
        .map((p) => ({ ...p, amount: fromCents(p.amount) })),
      today
    )
  )
}

const goalFor = (ownerId: string, goalId: string) =>
  loadGoals(ownerId, goalId)[0]
const viewGoal = (userId: string, goalId: string) =>
  viewOne("goal", userId, goalId, goalFor)

const canEditGoal = (userId: string, goalId: string) =>
  canEdit(access(userId, "goal", goalId))

const idParam = z.object({ id: id })
const goalPidParam = z.object({ id: id, pid: id })

const goalBody = z.object({
  name: boundedString(80).trim().min(1),
  kind: z.enum(GOAL_KINDS).default("save"),
  target: money.refine((n) => n > 0, "Target must be positive"),
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
  notes: boundedString(500).nullable().optional(),
  archived: z.boolean().default(false),
  startingAmount: money
    .refine((n) => n >= 0, "Amount cannot be negative")
    .optional(),
})

export function mountGoals(finance: Hono<Vars>) {
  finance.get("/goals", (c) =>
    c.json({
      goals: listWithShared("goal", c.var.user.id, loadGoals, goalFor),
    })
  )

  finance.post("/goals", validate("json", goalBody), async (c) => {
    const d = c.req.valid("json")
    const goalId = randomUUID()
    db.prepare(
      `INSERT INTO goal (id, user_id, name, kind, target, currency, target_date, icon, color, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      goalId,
      c.var.user.id,
      d.name,
      d.kind,
      toCents(d.target),
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
        goalId,
        toCents(d.startingAmount),
        todayIso(),
        d.kind === "payoff" ? "Already paid" : "Already saved"
      )
    }
    return c.json({ goal: viewGoal(c.var.user.id, goalId) })
  })

  const patchGoalBody = goalBody.omit({ startingAmount: true }).partial()

  finance.patch(
    "/goals/:id",
    validate("param", idParam),
    validate("json", patchGoalBody),
    async (c) => {
      const body = c.req.valid("json")
      const { id: goalId } = c.req.valid("param")
      const a = access(c.var.user.id, "goal", goalId)
      if (!a) return c.json({ error: "Not found" }, 404)
      if (!canEdit(a))
        return c.json({ error: "You can only view this goal." }, 403)
      if (a.role !== "owner") delete body.archived
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
        const v = (body as Record<string, unknown>)[k]
        if (v === undefined) continue
        sets.push(`${col} = ?`)
        vals.push(
          typeof v === "boolean"
            ? v
              ? 1
              : 0
            : k === "notes"
              ? (v as string | null)?.trim() || null
              : k === "target"
                ? toCents(v as number)
                : (v as string | number | null)
        )
      }
      if (sets.length) {
        db.prepare(
          `UPDATE goal SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
        ).run(...vals, goalId, a.ownerId)
      }
      const goal = viewGoal(c.var.user.id, goalId)
      return goal ? c.json({ goal }) : c.json({ error: "Not found" }, 404)
    }
  )

  finance.delete("/goals/:id", validate("param", idParam), (c) => {
    const { id: goalId } = c.req.valid("param")
    const r = db
      .prepare(`DELETE FROM goal WHERE id = ? AND user_id = ?`)
      .run(goalId, c.var.user.id)
    if (r.changes) forgetItem("goal", goalId)
    return r.changes
      ? c.json({ ok: true })
      : c.json({ error: "Not found" }, 404)
  })

  const paymentBody = z.object({
    amount: money.refine((n) => n !== 0, "Amount can’t be zero"),
    date: isoDate,
    note: boundedString(200).nullable().optional(),
    transactionId: id.nullable().optional(),
  })

  finance.post(
    "/goals/:id/payments",
    validate("param", idParam),
    validate("json", paymentBody),
    async (c) => {
      const d = c.req.valid("json")
      const userId = c.var.user.id
      const { id: goalId } = c.req.valid("param")
      if (!canEditGoal(userId, goalId))
        return c.json({ error: "Not found" }, 404)
      // Only the owner's bank can be linked: an editor's transaction would be a foreign reference.
      if (d.transactionId) {
        if (access(userId, "goal", goalId)?.role !== "owner")
          return c.json(
            { error: "Only the owner can link a bank transaction." },
            403
          )
        if (loadTransactions(userId, { id: d.transactionId }).length === 0)
          return c.json({ error: "Unknown transaction" }, 400)
      }
      db.prepare(
        `INSERT INTO goal_payment (id, goal_id, amount, date, note, transaction_id) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        goalId,
        toCents(d.amount),
        d.date,
        d.note?.trim() || null,
        d.transactionId ?? null
      )
      return c.json({ goal: viewGoal(userId, goalId) })
    }
  )

  finance.delete(
    "/goals/:id/payments/:pid",
    validate("param", goalPidParam),
    (c) => {
      const userId = c.var.user.id
      const { id: goalId, pid } = c.req.valid("param")
      const role = access(userId, "goal", goalId)?.role
      if (!role) return c.json({ error: "Not found" }, 404)
      if (role !== "owner")
        return c.json({ error: "Only the owner can delete this." }, 403)
      const r = db
        .prepare(`DELETE FROM goal_payment WHERE id = ? AND goal_id = ?`)
        .run(pid, goalId)
      return r.changes
        ? c.json({ goal: viewGoal(userId, goalId) })
        : c.json({ error: "Not found" }, 404)
    }
  )
}
