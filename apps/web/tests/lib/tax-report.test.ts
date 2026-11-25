import assert from "node:assert/strict"
import { test } from "node:test"
import type { Category, Transaction } from "../../src/lib/api.ts"
import {
	buildTaxReport,
	defaultReportYear,
	quarters,
	reportYears,
	toCsv,
} from "../../src/lib/tax-report.ts"

let serial = 0
function tx(
	date: string,
	amount: number,
	category: Category,
	over: Partial<Transaction> = {}
): Transaction {
	return {
		id: `t${++serial}`,
		accountId: "chq",
		date,
		description: "SHOP",
		amount,
		runningBalance: null,
		pending: false,
		note: null,
		createdAt: date,
		merchant: "Shop",
		merchantKey: "shop",
		category,
		categorySource: "auto",
		taxTag: null,
		taxTagSource: null,
		...over,
	}
}

test("transfers are left out and refunds lower spending", () => {
	const report = buildTaxReport([
		tx("2025-01-03", 3000, "income"),
		tx("2025-01-05", -500, "transfers"),
		tx("2025-01-08", -120, "shopping"),
		tx("2025-01-10", 20, "shopping"),
		tx("2025-02-01", -300, "debt"),
	])
	assert.equal(report.income, 3000)
	assert.equal(report.spending, 100)
	assert.equal(report.debtPayments, 300)
	assert.equal(report.count, 4)
	assert.ok(!report.byCategory.some((line) => line.category === "transfers"))
})

test("business and personal are split, and loose ends are found", () => {
	const report = buildTaxReport([
		tx("2025-03-01", 1500, "income", { taxTag: "business" }),
		tx("2025-03-02", 900, "income"),
		tx("2025-03-04", -60, "subscriptions", { taxTag: "business" }),
		tx("2025-03-05", -40, "food", {
			taxTag: "business",
			note: "Client lunch",
		}),
		tx("2025-03-06", -25, "other"),
		tx("2025-03-07", -10, "food", { pending: true }),
	])
	assert.equal(report.businessIn, 1500)
	assert.equal(report.businessOut, 100)
	assert.equal(report.personalOut, 35)
	assert.equal(report.review.untaggedIncome.length, 1)
	assert.equal(report.review.businessNoNote.length, 1)
	assert.equal(report.review.uncategorized.length, 1)
	assert.equal(report.review.pending.length, 1)
})

test("months roll up into quarters", () => {
	const report = buildTaxReport([
		tx("2025-01-10", -10, "food"),
		tx("2025-03-10", -15, "food"),
		tx("2025-04-01", -5, "food"),
	])
	assert.deepEqual(
		quarters(report.byMonth).map((quarter) => [
			quarter.quarter,
			quarter.moneyOut,
		]),
		[
			["2025 Q1", 25],
			["2025 Q2", 5],
		]
	)
})

test("the default year is last year during filing season", () => {
	const years = reportYears(
		[tx("2025-06-01", -1, "food")],
		new Date(2026, 2, 1)
	)
	assert.deepEqual(years, [2026, 2025])
	assert.equal(defaultReportYear(years, new Date(2026, 2, 1)), 2025)
	assert.equal(defaultReportYear(years, new Date(2026, 10, 1)), 2026)
})

test("csv cells with commas, quotes and newlines are quoted", () => {
	assert.equal(
		toCsv([["a,b", 'say "hi"', "x\ny", 3]]),
		'﻿"a,b","say ""hi""","x\ny",3\r\n'
	)
})
