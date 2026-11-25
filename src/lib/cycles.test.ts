import assert from "node:assert/strict"
import { test } from "node:test"
import { customCycle, cycleLabel, parseCustomCycle, shiftCycle } from "./cycles"

test("custom periods that match a preset fold into it", () => {
	assert.equal(customCycle(2, "weeks"), "biweekly")
	assert.equal(customCycle(12, "months"), "yearly")
	assert.equal(customCycle(5, "years"), "every-5-years")
})

test("parseCustomCycle reads custom periods and ignores presets", () => {
	assert.deepEqual(parseCustomCycle("every-4-months"), {
		every: 4,
		unit: "months",
	})
	assert.equal(parseCustomCycle("monthly"), null)
})

test("cycleLabel names presets and custom periods", () => {
	assert.equal(cycleLabel("quarterly"), "Every 3 months")
	assert.equal(cycleLabel("every-1-weeks"), "Every 1 week")
	assert.equal(cycleLabel("every-5-years"), "Every 5 years")
})

test("shiftCycle keeps the day of month, clamped to short months", () => {
	assert.equal(shiftCycle("2026-01-31", "monthly", 1), "2026-02-28")
	// Clamping is from the original date, so the 31st comes back in March.
	assert.equal(shiftCycle("2026-01-31", "monthly", 2), "2026-03-31")
	assert.equal(shiftCycle("2024-02-29", "yearly", 1), "2025-02-28")
	assert.equal(shiftCycle("2026-11-25", "biweekly", -1), "2026-11-11")
})
