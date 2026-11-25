import assert from "node:assert/strict"
import { test } from "node:test"
import type { FxRates } from "../../src/fx/rates.ts"
import { validateFxRates } from "../../src/fx/validate.ts"

const baseRates = (): FxRates => ({
	base: "USD",
	date: "2024-06-01",
	rates: {
		USD: 1,
		EUR: 0.9,
		GBP: 0.78,
		CAD: 1.35,
		JPY: 150,
		CHF: 0.88,
		AUD: 1.5,
	},
	fetchedAt: "2024-06-01T12:00:00.000Z",
	source: "live",
})

test("validateFxRates rejects a >50% jump on a major currency", () => {
	const prev = baseRates()
	const next = {
		...prev,
		rates: { ...prev.rates, EUR: 0.4 },
	}
	assert.throws(() => validateFxRates(next, prev), /EUR/)
})

test("validateFxRates rejects truncated coverage", () => {
	const prev = baseRates()
	const next = { ...prev, rates: { USD: 1, EUR: 0.9 } }
	assert.throws(() => validateFxRates(next, prev), /at least/)
})

test("validateFxRates accepts a modest update", () => {
	const prev = baseRates()
	const next = {
		...prev,
		rates: { ...prev.rates, EUR: 0.91 },
	}
	assert.doesNotThrow(() => validateFxRates(next, prev))
})
