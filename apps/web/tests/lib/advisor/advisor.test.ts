import assert from "node:assert/strict"
import { test } from "node:test"
import {
	buildAdvice,
	type AdvisorInput,
} from "../../../src/lib/advisor/index.ts"
import { chargesPerYear } from "../../../src/lib/advisor/helpers.ts"
import type { Account, Category, Transaction } from "../../../src/lib/api.ts"
import { addDays } from "../../../src/lib/format.ts"

const TODAY = "2026-11-20"

function account(over: Partial<Account> = {}): Account {
	return {
		id: "chq",
		connectionId: "c1",
		name: "Chequing",
		type: "chequing",
		numberMasked: null,
		currency: "CAD",
		balance: 500,
		available: 500,
		overdraftLimit: null,
		overdraftUsed: null,
		creditLimit: null,
		updatedAt: TODAY,
		...over,
	}
}

let serial = 0
function tx(
	date: string,
	amount: number,
	merchant: string,
	category: Category,
	accountId = "chq"
): Transaction {
	return {
		id: `t${++serial}`,
		accountId,
		date,
		description: merchant.toUpperCase(),
		amount,
		runningBalance: null,
		pending: false,
		note: null,
		createdAt: date,
		merchant,
		merchantKey: merchant.toLowerCase(),
		category,
		categorySource: "auto",
		taxTag: null,
		taxTagSource: null,
	}
}

/** Five months of a steady life: pay, rent, groceries; plus whatever `extra` adds. */
function history(
	extra: (date: string, i: number) => Transaction[] = () => []
): Transaction[] {
	const out: Transaction[] = []
	for (let i = 0; i < 150; i++) {
		const date = addDays(TODAY, -i)
		const day = Number(date.slice(8))
		if (day === 1) {
			out.push(
				tx(date, 4000, "Employer Payroll", "income"),
				tx(date, -1500, "Landlord", "bills")
			)
		}
		if (i % 7 === 0) {
			out.push(tx(date, -90, "Grocer", "groceries"))
		}
		out.push(...extra(date, i))
	}
	return out.toSorted((left, right) => right.date.localeCompare(left.date))
}

function input(over: Partial<AdvisorInput> = {}): AdvisorInput {
	return {
		today: TODAY,
		home: "CAD",
		accounts: [account()],
		transactions: history(),
		subscriptions: [],
		suggestions: [],
		goals: [],
		toHome: (amount) => amount,
		...over,
	}
}

test("chargesPerYear covers presets and custom cycles", () => {
	assert.equal(chargesPerYear("monthly"), 12)
	assert.equal(chargesPerYear("yearly"), 1)
	assert.equal(chargesPerYear("weekly"), 52)
})

test("spots coffee and delivery habits with a yearly saving", () => {
	const report = buildAdvice(
		input({
			transactions: history((date, i) => [
				...(i % 7 < 5 ? [tx(date, -5.25, "Starbucks", "food")] : []),
				...(i % 5 === 0 ? [tx(date, -38, "Uber Eats", "food")] : []),
			]),
		})
	)
	const coffee = report.tips.find((tip) => tip.id.startsWith("habit:coffee:"))
	const delivery = report.tips.find((tip) =>
		tip.id.startsWith("habit:delivery:")
	)
	assert.ok(coffee, "coffee tip")
	assert.ok(delivery, "delivery tip")
	assert.ok((coffee.yearly ?? 0) > 100)
	assert.ok((delivery.yearly ?? 0) > 100)
	// Their buttons open Transactions narrowed to just those merchants over the same 30 days.
	const coffeeLink = new URL(coffee.action!.to, "http://x")
	assert.equal(coffeeLink.pathname, "/accounts")
	assert.equal(coffeeLink.searchParams.get("merchants"), "starbucks")
	assert.equal(coffeeLink.searchParams.get("from"), addDays(TODAY, -29))
	assert.equal(
		new URL(delivery.action!.to, "http://x").searchParams.get("merchants"),
		"uber eats"
	)
})

test("a category running hot links to that category this month", () => {
	const report = buildAdvice(
		input({
			transactions: history((date) =>
				date >= "2026-11-01"
					? [tx(date, -40, "Gas Station", "transport")]
					: []
			),
		})
	)
	const pace = report.tips.find((tip) => tip.id.startsWith("pace:transport:"))
	assert.ok(pace, "pace tip")
	const url = new URL(pace.action!.to, "http://x")
	assert.equal(url.pathname, "/accounts")
	assert.equal(url.searchParams.get("category"), "transport")
	assert.equal(url.searchParams.get("from"), "2026-11-01")
	// The tip's figure is net of refunds, so the link keeps them in view for the totals to match.
	assert.equal(url.searchParams.get("flow"), null)
})

test("warns about overdraft and a thin cushion, ahead of savings ideas", () => {
	const report = buildAdvice(
		input({ accounts: [account({ balance: -200, available: 0 })] })
	)
	const ids = report.tips.map((tip) => tip.id)
	assert.ok(ids.includes("overdraft:chq"))
	assert.ok(ids.some((id) => id.startsWith("cushion:thin:")))
	// Ranked: every warning comes before every win.
	const lastWarn = Math.max(
		...report.tips.map((tip, index) => (tip.kind === "warn" ? index : -1))
	)
	const firstWin = report.tips.findIndex((tip) => tip.kind === "win")
	if (firstWin !== -1) {
		assert.ok(lastWarn < firstWin)
	}
})

test("a solid saver gets a good score and a pat on the back", () => {
	const report = buildAdvice(
		input({
			accounts: [
				account({ balance: 2000 }),
				account({
					id: "sav",
					name: "Savings",
					type: "savings",
					balance: 15000,
				}),
			],
		})
	)
	assert.ok(report.health)
	assert.ok(report.health.score >= 70, `score ${report.health.score}`)
	assert.ok(
		report.summary.savingsRate !== null && report.summary.savingsRate > 0.3
	)
	assert.ok(report.tips.some((tip) => tip.id.startsWith("saving:great:")))
	assert.ok(report.tips.some((tip) => tip.id.startsWith("cushion:solid:")))
})

test("no income means no score, and no crash", () => {
	const report = buildAdvice(
		input({
			transactions: history().filter(
				(transaction) => transaction.category !== "income"
			),
		})
	)
	assert.equal(report.health, null)
	assert.equal(report.summary.savingsRate, null)
})

test("tip ids are stable between runs", () => {
	const firstRun = buildAdvice(input()).tips.map((tip) => tip.id)
	const secondRun = buildAdvice(input()).tips.map((tip) => tip.id)
	assert.deepEqual(firstRun, secondRun)
})
