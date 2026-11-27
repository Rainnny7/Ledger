import assert from "node:assert/strict"
import { test } from "node:test"
import type { Category } from "@ledger/shared/categories"
import { isGroundedProse, sanitizeProse } from "../../src/digest/prose.ts"
import {
	computeSpendingDigest,
	type DigestTransaction,
	digestPeriodFor,
	monthEnd,
	shiftMonth,
} from "../../src/finance/spending-digest.ts"
import { spendingDigestMailContent } from "../../src/mail/spending-digest.tsx"

function tx(
	date: string,
	amount: number,
	merchant: string,
	category: Category = "other"
): DigestTransaction {
	return {
		date,
		amount,
		merchant,
		merchantKey: merchant.toLowerCase(),
		category,
	}
}

/** Three quiet months of history, then a busier October. */
function history(): DigestTransaction[] {
	const rows: DigestTransaction[] = []
	for (const month of ["2026-07", "2026-08", "2026-09"]) {
		rows.push(
			tx(`${month}-01`, 3000, "Employer", "income"),
			tx(`${month}-05`, -100, "Metro Grocer", "groceries"),
			tx(`${month}-10`, -50, "Cafe Uno", "food"),
			tx(`${month}-15`, -10, "StreamCo", "subscriptions")
		)
	}
	rows.push(
		tx("2026-10-01", 3000, "Employer", "income"),
		tx("2026-10-02", -400, "Metro Grocer", "groceries"),
		tx("2026-10-10", -50, "Cafe Uno", "food"),
		tx("2026-10-15", -15, "StreamCo", "subscriptions"),
		tx("2026-10-20", -900, "Big Appliance Store", "shopping"),
		tx("2026-10-21", -12, "Corner Shop", "shopping"),
		tx("2026-10-21", -12, "Corner Shop", "shopping"),
		tx("2026-10-25", -500, "Savings Move", "transfers")
	)
	return rows
}

test("month helpers", () => {
	assert.equal(shiftMonth("2026-01", -1), "2025-12")
	assert.equal(shiftMonth("2026-11", 2), "2027-01")
	assert.equal(digestPeriodFor("2026-11-01"), "2026-10")
	assert.equal(digestPeriodFor("2027-01-15"), "2026-12")
	assert.equal(monthEnd("2026-02"), "2026-02-28")
	assert.equal(monthEnd("2028-02"), "2028-02-29")
})

test("totals, net and savings rate ignore transfers", () => {
	const digest = computeSpendingDigest(history(), "2026-10", "CAD")
	assert.equal(digest.spent, 400 + 50 + 15 + 900 + 24)
	assert.equal(digest.income, 3000)
	assert.equal(digest.net, 3000 - 1389)
	assert.equal(digest.savingsRate, 53.7)
	assert.equal(digest.currency, "CAD")
})

test("compares with last month and keeps a three-month trend", () => {
	const digest = computeSpendingDigest(history(), "2026-10", "CAD")
	assert.equal(digest.previousMonth.month, "2026-09")
	assert.equal(digest.previousMonth.spent, 160)
	assert.equal(digest.previousMonth.spentChangePercent, 768)
	assert.deepEqual(
		digest.trend.map((month) => month.month),
		["2026-08", "2026-09", "2026-10"]
	)
})

test("savings rate is null with no income", () => {
	const digest = computeSpendingDigest(
		[tx("2026-10-05", -20, "Cafe Uno", "food")],
		"2026-10",
		"CAD"
	)
	assert.equal(digest.savingsRate, null)
	assert.equal(digest.previousMonth.spentChangePercent, null)
})

test("top categories are ranked with whole-number shares", () => {
	const digest = computeSpendingDigest(history(), "2026-10", "CAD")
	assert.equal(digest.topCategories[0].category, "shopping")
	assert.equal(digest.topCategories[0].spent, 924)
	assert.equal(digest.topCategories[0].share, 67)
	assert.ok(digest.topCategories.every((row) => row.category !== "income"))
})

test("category shifts compare against the three-month average", () => {
	const digest = computeSpendingDigest(history(), "2026-10", "CAD")
	const groceries = digest.categoryShifts.find(
		(shift) => shift.category === "groceries"
	)
	assert.deepEqual(groceries, {
		category: "groceries",
		spent: 400,
		average: 100,
		change: 300,
	})
	// Cafe Uno was flat, so food isn't flagged.
	assert.equal(
		digest.categoryShifts.some((shift) => shift.category === "food"),
		false
	)
})

test("flags new merchants, large one-offs and same-day duplicates", () => {
	const digest = computeSpendingDigest(history(), "2026-10", "CAD")
	assert.deepEqual(
		digest.unusual.newMerchants.map((entry) => entry.merchant),
		["Big Appliance Store", "Corner Shop"]
	)
	assert.deepEqual(
		digest.unusual.largeOneOffs.map((entry) => entry.merchant),
		["Big Appliance Store", "Metro Grocer"]
	)
	assert.deepEqual(digest.unusual.possibleDuplicates, [
		{ merchant: "Corner Shop", date: "2026-10-21", amount: 12, count: 2 },
	])
})

test("with no earlier history nothing is called a new merchant", () => {
	const digest = computeSpendingDigest(
		[tx("2026-10-05", -80, "Cafe Uno", "food")],
		"2026-10",
		"CAD"
	)
	assert.deepEqual(digest.unusual.newMerchants, [])
	assert.deepEqual(digest.categoryShifts, [])
})

test("a repeating bill is not a large one-off", () => {
	const rows = [
		tx("2026-08-01", -1500, "Landlord", "bills"),
		tx("2026-09-01", -1500, "Landlord", "bills"),
		tx("2026-10-01", -1500, "Landlord", "bills"),
		tx("2026-10-03", -10, "Cafe Uno", "food"),
	]
	const digest = computeSpendingDigest(rows, "2026-10", "CAD")
	assert.deepEqual(digest.unusual.largeOneOffs, [])
})

test("spots a new subscription and a price increase", () => {
	const rows = history()
	for (const date of ["2026-08-20", "2026-09-20", "2026-10-20"]) {
		rows.push(tx(date, -9.99, "MusicPlus", "subscriptions"))
	}
	// StreamCo went from 10 to 15 in October; MusicPlus first appeared in August, so it's not new
	// relative to September... but it wasn't recurring until its second charge.
	const digest = computeSpendingDigest(rows, "2026-10", "CAD")
	assert.ok(
		digest.recurring.priceIncreases.some(
			(entry) =>
				entry.name === "StreamCo" &&
				entry.from === 10 &&
				entry.to === 15
		)
	)
	const names = digest.recurring.newCharges.map((entry) => entry.name)
	assert.ok(!names.includes("StreamCo"))
})

test("a charge recurring for the first time this month is listed as new", () => {
	const rows = [
		tx("2026-09-20", -9.99, "MusicPlus", "subscriptions"),
		tx("2026-10-20", -9.99, "MusicPlus", "subscriptions"),
		tx("2026-10-02", -30, "Cafe Uno", "food"),
	]
	const digest = computeSpendingDigest(rows, "2026-10", "CAD")
	assert.deepEqual(digest.recurring.newCharges, [
		{ name: "MusicPlus", amount: 9.99, cycle: "monthly" },
	])
})

test("prose may only quote numbers from the digest", () => {
	const digest = computeSpendingDigest(history(), "2026-10", "CAD")
	assert.equal(
		isGroundedProse("You spent $1,389 and kept 53.7% of income.", digest),
		true
	)
	assert.equal(isGroundedProse("That is up 3 months in a row.", digest), true)
	assert.equal(isGroundedProse("You spent $2,500 this month.", digest), false)
	assert.equal(isGroundedProse("Savings were 71% of income.", digest), false)
})

test("sanitizeProse drops ungrounded and empty lines", () => {
	const digest = computeSpendingDigest(history(), "2026-10", "CAD")
	const prose = sanitizeProse(
		{
			headline: "  A big   shopping month. ",
			spending: "You spent $9,999 on shopping.",
			unusual: "",
			suggestion: "Try setting a limit for appliances.",
		},
		digest
	)
	assert.deepEqual(prose, {
		headline: "A big shopping month.",
		suggestion: "Try setting a limit for appliances.",
	})
})

test("the email carries the computed figures, bars and unsubscribe link", async () => {
	const digest = computeSpendingDigest(history(), "2026-10", "CAD")
	const { subject, text, html } = await spendingDigestMailContent({
		digest,
		prose: { headline: "A big shopping month." },
		unsubscribeUrl:
			"https://ledger.example/api/public/digest/unsubscribe?token=a.b",
		appUrl: "https://ledger.example",
	})
	assert.equal(subject, "Your October 2026 spending digest")
	assert.match(text, /A big shopping month\./)
	assert.match(
		text,
		/Unsubscribe: https:\/\/ledger\.example\/api\/public\/digest\/unsubscribe\?token=a\.b/
	)
	assert.match(text, /New merchant: Big Appliance Store/)
	assert.match(
		html,
		/<a href="https:\/\/ledger\.example\/api\/public\/digest\/unsubscribe\?token=a\.b"/
	)
	assert.match(html, /Big Appliance Store/)
	assert.doesNotMatch(html, /<script|<img/)
})

test("the email escapes merchant names and omits missing prose", async () => {
	const rows = [
		tx("2026-09-01", -5, "Old Shop"),
		tx("2026-10-05", -80, "<b>Evil & Co</b>"),
	]
	const digest = computeSpendingDigest(rows, "2026-10", "CAD")
	const { html, text } = await spendingDigestMailContent({
		digest,
		prose: {},
		unsubscribeUrl: "https://x.example/u?token=a.b",
		appUrl: "https://x.example",
	})
	assert.doesNotMatch(html, /<b>Evil/)
	assert.match(html, /&lt;b&gt;Evil &amp; Co&lt;\/b&gt;/)
	assert.doesNotMatch(text, /An idea/)
})
