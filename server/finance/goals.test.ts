import assert from "node:assert/strict"
import { test } from "node:test"
import { type GoalPaymentRow, type GoalRow, summarizeGoal } from "./goals.ts"

const goal = (over: Partial<GoalRow> = {}): GoalRow => ({
  id: "g",
  name: "Trip",
  kind: "save",
  target: 1000,
  currency: "CAD",
  targetDate: null,
  icon: "plane",
  color: "ocean",
  notes: null,
  archived: false,
  createdAt: "2026-01-01 12:00:00",
  ...over,
})
let n = 0
const pay = (date: string, amount: number): GoalPaymentRow => ({
  id: `p${++n}`,
  goalId: "g",
  amount,
  date,
  note: null,
  transactionId: null,
  createdAt: `${date} 12:00:00`,
})

test("partial payments add up, withdrawals count against", () => {
  const s = summarizeGoal(
    goal(),
    [pay("2026-01-05", 300), pay("2026-02-05", 250), pay("2026-02-20", -50)],
    "2026-03-01"
  )
  assert.equal(s.saved, 500)
  assert.equal(s.remaining, 500)
  assert.equal(s.progress, 0.5)
  assert.equal(s.status, "no-date")
  assert.equal(s.payments[0].date, "2026-02-20") // newest first
})

test("completion date is when the total first reached the target", () => {
  const s = summarizeGoal(
    goal(),
    [pay("2026-01-05", 600), pay("2026-02-05", 500), pay("2026-03-05", 100)],
    "2026-04-01"
  )
  assert.equal(s.status, "done")
  assert.equal(s.completedAt, "2026-02-05")
  assert.equal(s.remaining, 0)
  assert.equal(s.progress, 1)
})

test("deadline gives the per-month amount needed and a status", () => {
  const s = summarizeGoal(
    goal({ targetDate: "2026-07-01" }),
    [pay("2026-01-02", 100)],
    "2026-04-01"
  )
  assert.equal(s.remaining, 900)
  assert.ok(
    s.neededPerMonth && s.neededPerMonth > 280 && s.neededPerMonth < 320
  )
  assert.equal(s.status, "behind")
  const late = summarizeGoal(
    goal({ targetDate: "2026-03-01" }),
    [pay("2026-01-02", 100)],
    "2026-04-01"
  )
  assert.equal(late.status, "overdue")
  assert.equal(late.neededPerMonth, null)
})

test("steady pace projects a finish date", () => {
  const s = summarizeGoal(
    goal({ createdAt: "2025-12-01 00:00:00" }),
    [pay("2026-01-01", 100), pay("2026-02-01", 100), pay("2026-03-01", 100)],
    "2026-03-15"
  )
  assert.ok(s.pacePerMonth > 60 && s.pacePerMonth < 120, String(s.pacePerMonth))
  assert.ok(s.projectedDate && s.projectedDate > "2026-08-01")
})
