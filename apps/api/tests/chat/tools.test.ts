import assert from "node:assert/strict"
import { before, test } from "node:test"
import { toCents } from "@ledger/shared/money"
import { db, runMigrations } from "../../src/db/connection.ts"
import {
	bankAccount,
	bankConnection,
	bankTransaction,
	budget,
	goal,
	goalPayment,
	subscription,
	user,
} from "../../src/db/schema/index.ts"
import {
	createChatTools,
	financialOverviewForUser,
	getBudgetsForUser,
	getGoalsForUser,
	getSubscriptionsForUser,
	listAccountsForUser,
	memoizeToolExecute,
	searchTransactionsForUser,
	spendingSummaryForUser,
	stableToolCallKey,
} from "../../src/chat/tools.ts"
import { clearChatTransactionCaches } from "../../src/chat/transaction-load.ts"

const OWNER = "00000000-0000-4000-8000-0000000000aa"
const OTHER = "00000000-0000-4000-8000-0000000000bb"

const timestamp = new Date().toISOString()

before(() => {
	runMigrations()
	for (const id of [OWNER, OTHER]) {
		db.insert(user)
			.values({
				id,
				name: id,
				email: `${id}@example.com`,
				emailVerified: true,
				createdAt: timestamp,
				updatedAt: timestamp,
			})
			.onConflictDoNothing()
			.run()
	}
	db.insert(bankConnection)
		.values([
			{
				id: "conn-owner",
				userId: OWNER,
				institution: "demo",
				label: "Owner",
				usernameMasked: "o",
			},
			{
				id: "conn-other",
				userId: OTHER,
				institution: "demo",
				label: "Other",
				usernameMasked: "x",
			},
		])
		.run()
	db.insert(bankAccount)
		.values([
			{
				id: "acct-owner",
				connectionId: "conn-owner",
				externalKey: "ko",
				name: "Owner chequing",
				type: "chequing",
				currency: "CAD",
			},
			{
				id: "acct-other",
				connectionId: "conn-other",
				externalKey: "kx",
				name: "Other chequing",
				type: "chequing",
				currency: "CAD",
			},
		])
		.run()
	db.insert(bankTransaction)
		.values([
			{
				id: "tx-owner",
				accountId: "acct-owner",
				fingerprint: "fp-owner",
				date: "2026-03-01",
				description: "OWNER COFFEE",
				amount: toCents(-4.5),
				pending: false,
			},
			{
				id: "tx-other",
				accountId: "acct-other",
				fingerprint: "fp-other",
				date: "2026-03-01",
				description: "OTHER COFFEE",
				amount: toCents(-9),
				pending: false,
			},
		])
		.run()
	db.insert(budget)
		.values([
			{
				userId: OWNER,
				category: "food",
				amount: toCents(200),
				currency: "CAD",
			},
			{
				userId: OTHER,
				category: "food",
				amount: toCents(999),
				currency: "CAD",
			},
		])
		.run()
	db.insert(subscription)
		.values([
			{
				id: "sub-owner",
				userId: OWNER,
				name: "Owner stream",
				amount: toCents(15),
				currency: "CAD",
				cycle: "monthly",
				anchorDate: "2026-01-01",
				category: "subscriptions",
			},
			{
				id: "sub-other",
				userId: OTHER,
				name: "Other stream",
				amount: toCents(99),
				currency: "CAD",
				cycle: "monthly",
				anchorDate: "2026-01-01",
				category: "subscriptions",
			},
		])
		.run()
	db.insert(goal)
		.values([
			{
				id: "goal-owner",
				userId: OWNER,
				name: "Owner trip",
				target: toCents(1000),
				currency: "CAD",
			},
			{
				id: "goal-other",
				userId: OTHER,
				name: "Other trip",
				target: toCents(5000),
				currency: "CAD",
			},
		])
		.run()
	db.insert(goalPayment)
		.values([
			{
				id: "pay-owner",
				goalId: "goal-owner",
				amount: toCents(50),
				date: "2026-02-01",
			},
			{
				id: "pay-other",
				goalId: "goal-other",
				amount: toCents(500),
				date: "2026-02-01",
			},
		])
		.run()
})

test("listAccounts is scoped to the requested user", () => {
	const accounts = listAccountsForUser(OWNER).accounts
	assert.equal(accounts.length, 1)
	assert.equal(accounts[0].id, "acct-owner")
	assert.ok(!accounts.some((account) => account.id === "acct-other"))
})

test("searchTransactions never returns another user's rows", () => {
	const found = searchTransactionsForUser(OWNER, {
		limit: 50,
		sort: "date",
	}).transactions
	assert.equal(found.length, 1)
	assert.equal(
		(found[0] as { description?: string }).description ?? "OWNER COFFEE",
		"OWNER COFFEE"
	)
	assert.ok(
		!(found as { merchant: string }[]).some(
			(transaction) => transaction.merchant === "OTHER COFFEE"
		)
	)
})

test("spendingSummary and financialOverview stay user-scoped", () => {
	const summary = spendingSummaryForUser(OWNER, {
		from: "2026-01-01",
		until: "2026-12-31",
		groupBy: "category",
	})
	assert.ok(Number(summary.spendingTotal) >= 0)
	const overview = financialOverviewForUser(OWNER)
	const accountIds = (overview.accounts as { id: string }[]).map(
		(account) => account.id
	)
	assert.ok(accountIds.includes("acct-owner"))
	assert.ok(!accountIds.includes("acct-other"))
})

test("budgets, subscriptions, and goals are user-scoped", () => {
	const budgets = getBudgetsForUser(OWNER).budgets
	assert.equal(budgets.length, 1)
	assert.equal(budgets[0].amount, 200)

	const subscriptions = getSubscriptionsForUser(OWNER).subscriptions
	assert.equal(subscriptions.length, 1)
	assert.equal(subscriptions[0].id, "sub-owner")
	assert.equal(getSubscriptionsForUser(OWNER).monthlyTotal, 15)

	const goals = getGoalsForUser(OWNER).goals
	assert.equal(goals.length, 1)
	assert.equal(goals[0].name, "Owner trip")
	assert.equal(goals[0].saved, 50)
})

test("searchTransactions supports merchant, type, and amount sort", () => {
	clearChatTransactionCaches(OWNER)
	db.insert(bankTransaction)
		.values([
			{
				id: "tx-netflix",
				accountId: "acct-owner",
				fingerprint: "fp-nf",
				date: "2026-03-10",
				description: "NETFLIX.COM BILL",
				amount: toCents(-18.99),
				pending: false,
			},
			{
				id: "tx-big",
				accountId: "acct-owner",
				fingerprint: "fp-big",
				date: "2026-03-05",
				description: "BIG PURCHASE",
				amount: toCents(-500),
				pending: false,
			},
		])
		.run()
	const netflix = searchTransactionsForUser(OWNER, {
		merchant: "netflix",
		from: "2026-03-01",
		until: "2026-03-31",
		sort: "date",
		limit: 20,
	})
	assert.equal(netflix.totalMatches, 1)
	assert.equal(
		(
			netflix.transactions as { merchant: string }[]
		)[0].merchant.toLowerCase(),
		"netflix"
	)
	const largest = searchTransactionsForUser(OWNER, {
		type: "spending",
		sort: "amount",
		from: "2026-03-01",
		until: "2026-03-31",
		limit: 5,
	} as const)
	const amounts = (largest.transactions as { amount: number }[]).map(
		(row) => row.amount
	)
	assert.ok(Math.abs(amounts[0]) >= Math.abs(amounts[1] ?? 0))
	assert.equal(
		(largest.transactions as Record<string, unknown>[])[0].id,
		undefined,
		"slim rows omit ids"
	)
})

test("createChatTools dedupes identical invocations in one turn", async () => {
	const tools = createChatTools(OWNER) as unknown as Record<
		string,
		{ execute: (input: unknown) => Promise<unknown> }
	>
	const first = await tools.listAccounts.execute({})
	const second = await tools.listAccounts.execute({})
	assert.strictEqual(first, second)
})

test("stableToolCallKey is order-insensitive for object keys", () => {
	assert.equal(
		stableToolCallKey("searchTransactions", {
			from: "2026-01-01",
			limit: 5,
		}),
		stableToolCallKey("searchTransactions", {
			limit: 5,
			from: "2026-01-01",
		})
	)
})

test("memoizeToolExecute returns one shared promise", async () => {
	const cache = new Map<string, Promise<unknown>>()
	let runs = 0
	const [left, right] = await Promise.all([
		memoizeToolExecute(cache, "k", () => {
			runs += 1
			return { ok: true }
		}),
		memoizeToolExecute(cache, "k", () => {
			runs += 1
			return { ok: false }
		}),
	])
	assert.equal(runs, 1)
	assert.strictEqual(left, right)
})
