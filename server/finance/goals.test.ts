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
let counter = 0
const pay = (date: string, amount: number): GoalPaymentRow => ({
	id: `p${++counter}`,
	goalId: "g",
	amount,
	date,
	note: null,
	transactionId: null,
	createdAt: `${date} 12:00:00`,
})

test("partial payments add up, withdrawals count against", () => {
	const summary = summarizeGoal(
		goal(),
		[
			pay("2026-01-05", 300),
			pay("2026-02-05", 250),
			pay("2026-02-20", -50),
		],
		"2026-03-01"
	)
	assert.equal(summary.saved, 500)
	assert.equal(summary.remaining, 500)
	assert.equal(summary.progress, 0.5)
	assert.equal(summary.status, "no-date")
	assert.equal(summary.payments[0].date, "2026-02-20") // newest first
})

test("completion date is when the total first reached the target", () => {
	const summary = summarizeGoal(
		goal(),
		[
			pay("2026-01-05", 600),
			pay("2026-02-05", 500),
			pay("2026-03-05", 100),
		],
		"2026-04-01"
	)
	assert.equal(summary.status, "done")
	assert.equal(summary.completedAt, "2026-02-05")
	assert.equal(summary.remaining, 0)
	assert.equal(summary.progress, 1)
})

test("deadline gives the per-month amount needed and a status", () => {
	const summary = summarizeGoal(
		goal({ targetDate: "2026-07-01" }),
		[pay("2026-01-02", 100)],
		"2026-04-01"
	)
	assert.equal(summary.remaining, 900)
	assert.ok(
		summary.neededPerMonth &&
			summary.neededPerMonth > 280 &&
			summary.neededPerMonth < 320
	)
	assert.equal(summary.status, "behind")
	const late = summarizeGoal(
		goal({ targetDate: "2026-03-01" }),
		[pay("2026-01-02", 100)],
		"2026-04-01"
	)
	assert.equal(late.status, "overdue")
	assert.equal(late.neededPerMonth, null)
})

test("steady pace projects a finish date", () => {
	const summary = summarizeGoal(
		goal({ createdAt: "2025-12-01 00:00:00" }),
		[
			pay("2026-01-01", 100),
			pay("2026-02-01", 100),
			pay("2026-03-01", 100),
		],
		"2026-03-15"
	)
	assert.ok(
		summary.pacePerMonth > 60 && summary.pacePerMonth < 120,
		String(summary.pacePerMonth)
	)
	assert.ok(summary.projectedDate && summary.projectedDate > "2026-08-01")
})
