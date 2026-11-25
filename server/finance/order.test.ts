import assert from "node:assert/strict"
import { test } from "node:test"
import { toCents, toCentsOrNull } from "../../shared/money.ts"
import { orderWithinDays } from "./order.ts"

/** Written in dollars for readability; rows carry cents like the database. */
const buildTransaction = (
	id: string,
	amount: number,
	runningBalance: number | null,
	accountId = "a",
	date = "2026-11-24"
) => ({
	id,
	accountId,
	date,
	amount: toCents(amount),
	runningBalance: toCentsOrNull(runningBalance),
})

test("reorders a day by running balance, newest first", () => {
	// Real order: Reid (+532.84 → 1395.09), Uber (−55.70 → 1339.39), e-Transfer (−100 → 1239.39).
	const rows = [
		buildTransaction("uber", -55.7, 1339.39),
		buildTransaction("reid", 532.84, 1395.09),
		buildTransaction("etf", -100, 1239.39),
		buildTransaction("old", 27.05, 862.25, "a", "2026-11-23"),
	]
	assert.deepEqual(
		orderWithinDays(rows).map((transaction) => transaction.id),
		["etf", "uber", "reid", "old"]
	)
})

test("only moves rows within their own account and day", () => {
	const rows = [
		buildTransaction("b1", -5, 100, "b"),
		buildTransaction("a1", -10, 90),
		buildTransaction("a2", -10, 80),
	]
	assert.deepEqual(
		orderWithinDays(rows).map((transaction) => transaction.id),
		["b1", "a2", "a1"]
	)
})

test("keeps the stored order when balances are missing or ambiguous", () => {
	const missing = [
		buildTransaction("x", -10, null),
		buildTransaction("y", -10, 90),
	]
	assert.deepEqual(
		orderWithinDays(missing).map((transaction) => transaction.id),
		["x", "y"]
	)
	const broken = [
		buildTransaction("x", -10, 50),
		buildTransaction("y", -10, 90),
	]
	assert.deepEqual(
		orderWithinDays(broken).map((transaction) => transaction.id),
		["x", "y"]
	)
})
