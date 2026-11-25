import assert from "node:assert/strict"
import { test } from "node:test"
import {
	allocateCents,
	convertCents,
	fromCents,
	mulCents,
	mulMoney,
	roundMoney,
	splitCents,
	sumMoney,
	toCents,
	toCentsOrNull,
} from "./money.ts"

test("toCents rounds half away from zero and strips float noise", () => {
	assert.equal(toCents(1.005), 101)
	assert.equal(toCents(-1.005), -101)
	assert.equal(toCents(0.1 + 0.2), 30)
	assert.equal(toCents(19.99), 1999)
	assert.equal(toCents(1.004), 100)
	assert.equal(toCents(0), 0)
	assert.ok(Object.is(toCents(-0.001), 0), "no negative zero")
})

test("toCents rejects non-finite and absurdly large amounts", () => {
	assert.throws(() => toCents(Number.NaN), RangeError)
	assert.throws(() => toCents(Number.POSITIVE_INFINITY), RangeError)
	assert.throws(() => toCents(1e17), RangeError)
	assert.equal(toCentsOrNull(null), null)
	assert.equal(toCentsOrNull(undefined), null)
})

test("fromCents and roundMoney round-trip", () => {
	assert.equal(fromCents(1999), 19.99)
	assert.equal(roundMoney(0.1 + 0.2), 0.3)
	assert.equal(roundMoney(-2.675), -2.68)
})

test("sums add as cents, not floats", () => {
	assert.equal(sumMoney([0.1, 0.2]), 0.3)
	assert.equal(sumMoney(Array.from({ length: 10 }, () => 0.1)), 1)
	assert.equal(sumMoney([]), 0)
})

test("multiplying rounds to a cent once", () => {
	assert.equal(mulMoney(25, 7.5), 187.5)
	assert.equal(mulMoney(33.33, 3), 99.99)
	assert.equal(mulCents(1999, 0.13), 260) // 259.87
	assert.equal(mulCents(-1999, 0.13), -260)
})

test("FX conversion goes through the rates and rounds once", () => {
	assert.equal(convertCents(10_000, 1, 1.35), 13_500)
	assert.equal(convertCents(10_000, 1.35, 1), 7407)
	assert.throws(() => convertCents(100, 0, 1), RangeError)
})

test("allocateCents never loses a cent", () => {
	assert.deepEqual(allocateCents(100, [1, 1, 1]), [34, 33, 33])
	assert.deepEqual(allocateCents(-100, [1, 1, 1]), [-34, -33, -33])
	assert.deepEqual(allocateCents(10, [1, 0, 1]), [5, 0, 5])
	assert.deepEqual(allocateCents(0, [1, 2]), [0, 0])
	assert.deepEqual(allocateCents(1000, [50, 30, 20]), [500, 300, 200])
	const parts = allocateCents(9_999_999, [3, 7, 11, 13])
	assert.equal(
		parts.reduce((total, part) => total + part, 0),
		9_999_999
	)
	assert.throws(() => allocateCents(1.5, [1]), RangeError)
	assert.throws(() => allocateCents(100, []), RangeError)
	assert.throws(() => allocateCents(100, [0, 0]), RangeError)
	assert.throws(() => allocateCents(100, [-1, 2]), RangeError)
})

test("splitCents spreads the remainder to the first parts", () => {
	assert.deepEqual(splitCents(100, 3), [34, 33, 33])
	assert.deepEqual(splitCents(1, 3), [1, 0, 0])
	assert.throws(() => splitCents(100, 0), RangeError)
})
