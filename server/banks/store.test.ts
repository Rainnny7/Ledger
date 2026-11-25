import assert from "node:assert/strict"
import { test } from "node:test"
import { planTransactionCarryOvers, type StoredTx } from "./sync-match.ts"

const row = (
	id: string,
	fingerprint: string,
	date: string,
	description: string,
	amount: number,
	pending: boolean
): StoredTx => ({
	id,
	fingerprint,
	date,
	description,
	amount,
	pending,
})

test("pending→posted carry-over when fingerprint changes", () => {
	const stored = [
		row(
			"p1",
			"2026-01-10|coffee|p|0",
			"2026-01-10",
			"COFFEE SHOP",
			-4.5,
			true
		),
		row(
			"n1",
			"2026-01-11|coffee shop|posted|0",
			"2026-01-11",
			"Coffee Shop",
			-4.5,
			false
		),
	]
	const incoming = new Set(["2026-01-11|coffee shop|posted|0"])
	const { pairs, deleteIds } = planTransactionCarryOvers(
		stored,
		incoming,
		"2026-01-11",
		"2026-01-11"
	)
	assert.deepEqual(pairs, [{ fromId: "p1", toId: "n1" }])
	assert.deepEqual(deleteIds, ["p1"])
})

test("bank edit inside sync window reconciles stale posted row", () => {
	const stored = [
		row("old", "2026-02-01|payee|amt|0", "2026-02-01", "PAYEE", -20, false),
		row(
			"new",
			"2026-02-03|payee co|amt|0",
			"2026-02-03",
			"Payee Co",
			-20,
			false
		),
	]
	const incoming = new Set(["2026-02-03|payee co|amt|0"])
	const { pairs } = planTransactionCarryOvers(
		stored,
		incoming,
		"2026-02-01",
		"2026-02-03"
	)
	assert.deepEqual(pairs, [{ fromId: "old", toId: "new" }])
})

test("posted row outside returned range is not removed", () => {
	const stored = [
		row("keep", "2025-01-01|old|0", "2025-01-01", "Old", -1, false),
		row("fresh", "2026-03-01|new|0", "2026-03-01", "New", -1, false),
	]
	const incoming = new Set(["2026-03-01|new|0"])
	const { pairs, deleteIds } = planTransactionCarryOvers(
		stored,
		incoming,
		"2026-03-01",
		"2026-03-01"
	)
	assert.deepEqual(pairs, [])
	assert.deepEqual(deleteIds, [])
})

test("empty sync touches nothing", () => {
	const stored = [
		row("p", "fp-p", "2026-01-01", "Pending", -10, true),
		row("c", "fp-c", "2026-01-02", "Posted", -5, false),
	]
	const { pairs, deleteIds } = planTransactionCarryOvers(
		stored,
		new Set(),
		"2026-01-01",
		"2026-01-02"
	)
	assert.deepEqual(pairs, [])
	assert.deepEqual(deleteIds, [])
})

test("two identical same-day charges match one-to-one", () => {
	const stored = [
		row("p0", "d|shop|10|p|0", "2026-04-01", "SHOP", -10, true),
		row("p1", "d|shop|10|p|1", "2026-04-01", "SHOP", -10, true),
		row("n0", "d|shop|10|c|0", "2026-04-01", "Shop", -10, false),
		row("n1", "d|shop|10|c|1", "2026-04-01", "Shop", -10, false),
	]
	const incoming = new Set(["d|shop|10|c|0", "d|shop|10|c|1"])
	const { pairs } = planTransactionCarryOvers(
		stored,
		incoming,
		"2026-04-01",
		"2026-04-01"
	)
	assert.equal(pairs.length, 2)
	assert.deepEqual(pairs.map((pair) => pair.fromId).toSorted(), ["p0", "p1"])
	assert.deepEqual(pairs.map((pair) => pair.toId).toSorted(), ["n0", "n1"])
})
