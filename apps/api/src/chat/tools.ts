import { tool } from "ai"
import { z } from "zod"
import { CATEGORIES, type Cycle } from "@ledger/shared/categories"
import { fromCents, fromCentsOrNull, roundMoney } from "@ledger/shared/money"
import { asc, eq, sql } from "drizzle-orm"
import { db } from "../db/connection.ts"
import {
	bankAccount,
	bankConnection,
	budget,
	goal,
	goalPayment,
	subscription as subscriptionTable,
} from "../db/schema/index.ts"
import {
	type GoalPaymentRow,
	type GoalRow,
	summarizeGoal,
} from "../finance/goals.ts"
import { monthlyEquivalent } from "../finance/recurring.ts"
import type { EnrichedTx } from "../routes/finance/types.ts"
import { isoDate, money } from "../http/validation.ts"
import { loadChatTransactions } from "./transaction-load.ts"
import { todayIso } from "../time/today.ts"

const SEARCH_TX_LIMIT = 60
const SEARCH_TX_BYTE_BUDGET = 7_200
const SEARCH_TX_LOAD_CAP = 50_000
const SPENDING_GROUP_CAP = 40
const OVERVIEW_TOP_MERCHANTS = 10
const OVERVIEW_TOP_CATEGORIES = 16
const OVERVIEW_UPCOMING_SUBS = 8

const groupByKind = z.enum(["category", "merchant", "month"])
const searchSortKind = z.enum(["date", "amount"])
const searchTypeKind = z.enum(["spending", "income"])

const searchTransactionsInput = z.object({
	from: isoDate.optional(),
	until: isoDate.optional(),
	category: z.enum(CATEGORIES).optional(),
	/** Matches merchant display name or merchant key (case-insensitive). */
	merchant: z.string().max(200).optional(),
	/** Case-insensitive substring in description (use merchant when possible). */
	text: z.string().max(200).optional(),
	minAmount: money.optional(),
	maxAmount: money.optional(),
	type: searchTypeKind.optional(),
	sort: searchSortKind.default("date"),
	limit: z.number().int().min(1).max(SEARCH_TX_LIMIT).default(40),
})

const spendingSummaryInput = z.object({
	from: isoDate,
	until: isoDate,
	groupBy: groupByKind.default("category"),
})

type AccountCurrencyMap = Map<string, string>

/** One query: account ids to currency for compact tool payloads. */
function accountCurrencyById(userId: string): AccountCurrencyMap {
	const rows = db
		.select({
			id: bankAccount.id,
			currency: bankAccount.currency,
		})
		.from(bankAccount)
		.innerJoin(
			bankConnection,
			eq(bankConnection.id, bankAccount.connectionId)
		)
		.where(eq(bankConnection.userId, userId))
		.all()
	return new Map(rows.map((row) => [row.id, row.currency]))
}

function dominantCurrency(currencies: AccountCurrencyMap): string | "mixed" {
	if (currencies.size === 0) {
		return "CAD"
	}
	if (currencies.size === 1) {
		return [...currencies.values()][0]
	}
	const first = [...currencies.values()][0]
	return [...currencies.values()].every((value) => value === first)
		? first
		: "mixed"
}

/** Omit null, undefined, and empty strings from plain objects for smaller model payloads. */
function compactRecord<T extends Record<string, unknown>>(record: T): T {
	const out = { ...record }
	for (const key of Object.keys(out)) {
		const value = out[key]
		if (value === null || value === undefined || value === "") {
			delete out[key]
		}
	}
	return out
}

function jsonByteLength(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).length
}

/** Slim row for the model: ids omitted; description only when it adds detail. */
function slimTransactionRow(
	transaction: EnrichedTx,
	omitPerRowCurrency: boolean,
	currency: string
) {
	const merchant = transaction.merchant
	const descriptionDiffers =
		transaction.description.trim().toLowerCase() !==
		merchant.trim().toLowerCase()
	const row: Record<string, unknown> = {
		date: transaction.date,
		merchant,
		amount: roundMoney(transaction.amount),
		category: transaction.category,
		...(descriptionDiffers ? { description: transaction.description } : {}),
		...(transaction.pending ? { pending: true } : {}),
		...(omitPerRowCurrency ? {} : { currency }),
	}
	return compactRecord(row as Record<string, unknown>) as Record<
		string,
		unknown
	>
}

function capRowsByByteBudget<T>(rows: T[], byteBudget: number): T[] {
	let slice = rows
	while (slice.length > 1 && jsonByteLength(slice) > byteBudget) {
		slice = slice.slice(0, Math.max(1, Math.floor(slice.length * 0.85)))
	}
	return slice
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value)
	}
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableJson(entry)).join(",")}]`
	}
	const record = value as Record<string, unknown>
	const keys = Object.keys(record).toSorted()
	return `{${keys
		.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
		.join(",")}}`
}

/** Stable cache key for deduplicating identical tool calls in one assistant turn. */
export function stableToolCallKey(toolName: string, input: unknown): string {
	return `${toolName}:${stableJson(input ?? {})}`
}

/** Reuse the in-flight result when the same tool+args is invoked twice in one turn. */
export function memoizeToolExecute<T>(
	cache: Map<string, Promise<unknown>>,
	key: string,
	run: () => T | Promise<T>
): Promise<T> {
	const hit = cache.get(key)
	if (hit) {
		return hit as Promise<T>
	}
	const result = Promise.resolve(run())
	cache.set(key, result)
	return result
}

/** Bank accounts for one user with decimal money fields. */
export function listAccountsForUser(userId: string) {
	const rows = db
		.select({
			id: bankAccount.id,
			connectionId: bankAccount.connectionId,
			name: bankAccount.name,
			type: bankAccount.type,
			numberMasked: bankAccount.numberMasked,
			currency: bankAccount.currency,
			balance: bankAccount.balance,
			available: bankAccount.available,
			updatedAt: bankAccount.updatedAt,
		})
		.from(bankAccount)
		.innerJoin(
			bankConnection,
			eq(bankConnection.id, bankAccount.connectionId)
		)
		.where(eq(bankConnection.userId, userId))
		.orderBy(asc(bankAccount.type), asc(bankAccount.name))
		.all()
	return {
		currency: dominantCurrency(
			new Map(rows.map((row) => [row.id, row.currency]))
		),
		accounts: rows.map((row) =>
			compactRecord({
				id: row.id,
				name: row.name,
				type: row.type,
				numberMasked: row.numberMasked,
				balance: fromCentsOrNull(row.balance),
				available: fromCentsOrNull(row.available),
				updatedAt: row.updatedAt,
			})
		),
	}
}

/** Individual transactions with filters; totals cover every match, not only returned rows. */
export function searchTransactionsForUser(
	userId: string,
	input: z.infer<typeof searchTransactionsInput>
) {
	const currencies = accountCurrencyById(userId)
	const sharedCurrency = dominantCurrency(currencies)
	const omitPerRowCurrency = sharedCurrency !== "mixed"
	const rowCap = Math.min(input.limit, SEARCH_TX_LIMIT)
	const merchantNeedle = input.merchant?.trim().toLowerCase()
	const textNeedle = input.text?.trim()
	const loaded = loadChatTransactions(userId, {
		from: input.from,
		until: input.until,
		minAmount: input.minAmount,
		maxAmount: input.maxAmount,
		textSql: textNeedle && !merchantNeedle ? textNeedle : undefined,
		limit: SEARCH_TX_LOAD_CAP,
	})
	let transactions = loaded.transactions
	if (input.category) {
		transactions = transactions.filter(
			(transaction) => transaction.category === input.category
		)
	}
	if (input.type === "spending") {
		transactions = transactions.filter(
			(transaction) => transaction.amount < 0
		)
	} else if (input.type === "income") {
		transactions = transactions.filter(
			(transaction) => transaction.amount > 0
		)
	}
	if (merchantNeedle) {
		transactions = transactions.filter((transaction) => {
			const hay =
				`${transaction.merchant}\n${transaction.merchantKey}`.toLowerCase()
			return hay.includes(merchantNeedle)
		})
	}
	if (textNeedle) {
		const needle = textNeedle.toLowerCase()
		transactions = transactions.filter((transaction) => {
			const hay =
				`${transaction.merchant}\n${transaction.description}`.toLowerCase()
			return hay.includes(needle)
		})
	}
	let totalSpending = 0
	let totalIncome = 0
	for (const transaction of transactions) {
		if (transaction.amount < 0) {
			totalSpending += Math.abs(transaction.amount)
		} else if (transaction.amount > 0) {
			totalIncome += transaction.amount
		}
	}
	const totalMatches = transactions.length
	if (input.sort === "amount") {
		transactions = transactions.toSorted(
			(left, right) =>
				Math.abs(right.amount) - Math.abs(left.amount) ||
				right.date.localeCompare(left.date)
		)
	}
	let slimRows = transactions.map((transaction) =>
		slimTransactionRow(
			transaction,
			omitPerRowCurrency,
			currencies.get(transaction.accountId) ?? "CAD"
		)
	)
	slimRows = capRowsByByteBudget(slimRows, SEARCH_TX_BYTE_BUDGET)
	if (slimRows.length > rowCap) {
		slimRows = slimRows.slice(0, rowCap)
	}
	const truncated =
		loaded.truncated ||
		totalMatches > slimRows.length ||
		slimRows.length < totalMatches
	return compactRecord({
		currency: sharedCurrency,
		sort: input.sort,
		transactions: slimRows,
		totalMatches,
		totalSpending: roundMoney(totalSpending),
		totalIncome: roundMoney(totalIncome),
		...(truncated ? { truncated: true } : {}),
	})
}

type SpendingBucket = {
	key: string
	spending: number
	income: number
	count: number
	currency: string
}

/** Spending and income totals grouped over a date range (transfers excluded). */
export function spendingSummaryForUser(
	userId: string,
	input: z.infer<typeof spendingSummaryInput>
) {
	const currencies = accountCurrencyById(userId)
	const totalsCurrency = dominantCurrency(currencies)
	const loaded = loadChatTransactions(userId, {
		from: input.from,
		until: input.until,
		limit: 2_000_000,
	})
	const transactions = loaded.transactions.filter(
		(transaction) => transaction.category !== "transfers"
	)

	const buckets = new Map<string, SpendingBucket>()
	let spendingTotal = 0
	let incomeTotal = 0

	for (const transaction of transactions) {
		const currency = currencies.get(transaction.accountId) ?? "CAD"
		const key =
			input.groupBy === "category"
				? transaction.category
				: input.groupBy === "merchant"
					? transaction.merchant
					: transaction.date.slice(0, 7)
		const bucketKey = `${currency}\0${key}`
		let bucket = buckets.get(bucketKey)
		if (!bucket) {
			bucket = {
				key,
				spending: 0,
				income: 0,
				count: 0,
				currency,
			}
			buckets.set(bucketKey, bucket)
		}
		bucket.count += 1
		if (transaction.amount > 0) {
			bucket.income += transaction.amount
			incomeTotal += transaction.amount
		} else if (transaction.amount < 0) {
			const spent = Math.abs(transaction.amount)
			bucket.spending += spent
			spendingTotal += spent
		}
	}

	const sorted = [...buckets.values()].toSorted((left, right) =>
		right.spending + right.income > left.spending + left.income ? 1 : -1
	)
	const groupCap = sorted.length > SPENDING_GROUP_CAP
	const groups = sorted.slice(0, SPENDING_GROUP_CAP).map((bucket) =>
		compactRecord({
			key: bucket.key,
			spending: roundMoney(bucket.spending),
			income: roundMoney(bucket.income),
			count: bucket.count,
			...(totalsCurrency === "mixed"
				? { currency: bucket.currency }
				: {}),
		})
	)

	return compactRecord({
		from: input.from,
		until: input.until,
		groupBy: input.groupBy,
		currency: totalsCurrency,
		spendingTotal: roundMoney(spendingTotal),
		incomeTotal: roundMoney(incomeTotal),
		groups,
		...(groupCap ? { truncated: true, totalGroups: sorted.length } : {}),
	})
}

/** Monthly budget limits per category for one user. */
export function getBudgetsForUser(userId: string) {
	const budgets = db
		.select({
			category: budget.category,
			amount: budget.amount,
			currency: budget.currency,
			updatedAt: budget.updatedAt,
		})
		.from(budget)
		.where(eq(budget.userId, userId))
		.orderBy(asc(budget.category))
		.all()
		.map((row) =>
			compactRecord({
				category: row.category,
				amount: fromCents(row.amount),
				currency: row.currency,
				updatedAt: row.updatedAt,
			})
		)
	const currency =
		budgets.length > 0 &&
		budgets.every((row) => row.currency === budgets[0].currency)
			? budgets[0].currency
			: "mixed"
	return compactRecord({ currency, budgets })
}

/** Recurring subscriptions tracked for one user. */
export function getSubscriptionsForUser(userId: string) {
	const subscriptions = db
		.select({
			id: subscriptionTable.id,
			name: subscriptionTable.name,
			amount: subscriptionTable.amount,
			currency: subscriptionTable.currency,
			cycle: subscriptionTable.cycle,
			anchorDate: subscriptionTable.anchorDate,
			category: subscriptionTable.category,
			active: subscriptionTable.active,
		})
		.from(subscriptionTable)
		.where(eq(subscriptionTable.userId, userId))
		.orderBy(sql`${subscriptionTable.name} COLLATE NOCASE`)
		.all()
		.map((row) =>
			compactRecord({
				id: row.id,
				name: row.name,
				amount: fromCents(row.amount),
				currency: row.currency,
				cycle: row.cycle,
				anchorDate: row.anchorDate,
				category: row.category,
				...(row.active ? {} : { active: false }),
			})
		)
	const currency =
		subscriptions.length > 0 &&
		subscriptions.every((row) => row.currency === subscriptions[0].currency)
			? subscriptions[0].currency
			: "mixed"
	const active = subscriptions.filter((row) => row.active !== false)
	let monthlyTotal = 0
	for (const row of active) {
		monthlyTotal += monthlyEquivalent(row.amount, row.cycle as Cycle)
	}
	return compactRecord({
		currency,
		monthlyTotal: roundMoney(monthlyTotal),
		yearlyTotal: roundMoney(monthlyTotal * 12),
		subscriptions,
	})
}

function loadGoalsForUser(userId: string) {
	const goals = db
		.select({
			id: goal.id,
			name: goal.name,
			kind: goal.kind,
			target: goal.target,
			currency: goal.currency,
			targetDate: goal.targetDate,
			icon: goal.icon,
			color: goal.color,
			notes: goal.notes,
			archived: goal.archived,
			createdAt: goal.createdAt,
		})
		.from(goal)
		.where(eq(goal.userId, userId))
		.orderBy(asc(goal.createdAt))
		.all() as GoalRow[]
	if (goals.length === 0) {
		return []
	}
	const payments: GoalPaymentRow[] = db
		.select({
			id: goalPayment.id,
			goalId: goalPayment.goalId,
			amount: goalPayment.amount,
			date: goalPayment.date,
			note: goalPayment.note,
			transactionId: goalPayment.transactionId,
			createdAt: goalPayment.createdAt,
		})
		.from(goalPayment)
		.innerJoin(goal, eq(goal.id, goalPayment.goalId))
		.where(eq(goal.userId, userId))
		.all()
	const today = todayIso()
	return goals.map((goalRow) =>
		summarizeGoal(
			{ ...goalRow, target: fromCents(goalRow.target) },
			payments
				.filter((payment) => payment.goalId === goalRow.id)
				.map((payment) => ({
					...payment,
					amount: fromCents(payment.amount),
				})),
			today
		)
	)
}

/** Savings and pay-off goals with progress and savings-account balances for one user. */
export function getGoalsForUser(userId: string) {
	const accounts = listAccountsForUser(userId)
	const savingsBalance = (
		accounts.accounts as { type: string; balance: number | null }[]
	)
		.filter((account) => account.type === "savings")
		.reduce((sum, account) => sum + (account.balance ?? 0), 0)
	const goals = loadGoalsForUser(userId).map((summary) =>
		compactRecord({
			id: summary.id,
			name: summary.name,
			kind: summary.kind,
			target: roundMoney(summary.target),
			saved: roundMoney(summary.saved),
			remaining: roundMoney(summary.remaining),
			progress: summary.progress,
			currency: summary.currency,
			targetDate: summary.targetDate,
			status: summary.status,
			...(summary.archived ? { archived: true } : {}),
		})
	)
	return compactRecord({
		currency: accounts.currency,
		savingsAccountBalance: roundMoney(savingsBalance),
		goals,
	})
}

function monthBounds(reference: string) {
	const [year, month] = reference.split("-").map(Number)
	const from = `${year}-${String(month).padStart(2, "0")}-01`
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
	const until = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
	return { from, until }
}

function previousMonthReference(reference: string) {
	const [year, month] = reference.split("-").map(Number)
	const date = new Date(Date.UTC(year, month - 2, 1))
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Accounts, this/previous month category totals, merchants, budgets, and subscription rollups in one call. */
export function financialOverviewForUser(userId: string) {
	const today = todayIso()
	const currentRef = today.slice(0, 7)
	const { from, until } = monthBounds(currentRef)
	const previousRef = previousMonthReference(currentRef)
	const previousBounds = monthBounds(previousRef)
	const accounts = listAccountsForUser(userId)
	const month = spendingSummaryForUser(userId, {
		from,
		until,
		groupBy: "category",
	})
	const previousMonth = spendingSummaryForUser(userId, {
		from: previousBounds.from,
		until: previousBounds.until,
		groupBy: "category",
	})
	const merchantsThisMonth = spendingSummaryForUser(userId, {
		from,
		until,
		groupBy: "merchant",
	})
	const budgets = getBudgetsForUser(userId)
	const subscriptions = getSubscriptionsForUser(userId)

	const spentByCategory = new Map<string, number>()
	for (const group of (month.groups as { key: string; spending: number }[]) ??
		[]) {
		spentByCategory.set(group.key, group.spending)
	}

	const budgetStatus = (
		budgets.budgets as { category: string; amount: number }[]
	).map((row) => {
		const spent = spentByCategory.get(row.category) ?? 0
		const remaining = roundMoney(row.amount - spent)
		return compactRecord({
			category: row.category,
			limit: roundMoney(row.amount),
			spent: roundMoney(spent),
			remaining,
			over: remaining < 0,
		})
	})

	const categoryTotals = (
		(month.groups as { key: string; spending: number; income: number }[]) ??
		[]
	)
		.filter((group) => group.spending > 0 || group.income > 0)
		.toSorted((left, right) => right.spending - left.spending)
		.slice(0, OVERVIEW_TOP_CATEGORIES)

	const previousCategoryTotals = (
		(previousMonth.groups as {
			key: string
			spending: number
			income: number
		}[]) ?? []
	)
		.filter((group) => group.spending > 0 || group.income > 0)
		.toSorted((left, right) => right.spending - left.spending)
		.slice(0, OVERVIEW_TOP_CATEGORIES)

	const topMerchants = (
		(merchantsThisMonth.groups as { key: string; spending: number }[]) ?? []
	)
		.filter((group) => group.spending > 0)
		.slice(0, OVERVIEW_TOP_MERCHANTS)

	const upcoming = (
		subscriptions.subscriptions as {
			name: string
			amount: number
			cycle: string
			anchorDate: string
			active?: boolean
		}[]
	)
		.filter((row) => row.active !== false)
		.toSorted((left, right) =>
			left.anchorDate.localeCompare(right.anchorDate)
		)
		.slice(0, OVERVIEW_UPCOMING_SUBS)

	return compactRecord({
		asOf: today,
		currentMonth: compactRecord({
			from,
			until,
			spendingTotal: month.spendingTotal,
			incomeTotal: month.incomeTotal,
			categoryTotals,
			topMerchants,
		}),
		previousMonth: compactRecord({
			from: previousBounds.from,
			until: previousBounds.until,
			spendingTotal: previousMonth.spendingTotal,
			incomeTotal: previousMonth.incomeTotal,
			categoryTotals: previousCategoryTotals,
		}),
		currency: accounts.currency,
		accounts: accounts.accounts,
		budgetStatus,
		subscriptions: compactRecord({
			monthlyTotal: subscriptions.monthlyTotal,
			yearlyTotal: subscriptions.yearlyTotal,
			upcoming,
		}),
	})
}

/** One read-only finance tool, defined once and exposed by both the AI chat and the MCP server. */
export interface FinanceToolDefinition {
	name: string
	description: string
	inputSchema: z.ZodObject
	/** Runs the tool for one user; every query is scoped to `userId`. */
	run: (userId: string, input: never) => unknown
}

const emptyInput = z.object({})

/** Every read-only finance tool: the single source for chat and MCP names, descriptions, schemas and logic. */
export const financeToolDefinitions: readonly FinanceToolDefinition[] = [
	{
		name: "financialOverview",
		description:
			"Default first tool. Includes account balances, this month and last month income/spending with per-category totals, top merchants, budget vs spent (over flagged), and subscription monthly/yearly totals plus upcoming renewals. Already has last month's category spend and this month's income—do not also call spendingSummary or getBudgets for those.",
		inputSchema: emptyInput,
		run: (userId) => financialOverviewForUser(userId),
	},
	{
		name: "listAccounts",
		description:
			"Balances and account list only. financialOverview already includes this; use listAccounts only when the user wants accounts without any spending data.",
		inputSchema: emptyInput,
		run: (userId) => listAccountsForUser(userId),
	},
	{
		name: "searchTransactions",
		description:
			"Line-item transactions: always set from/until; use merchant filter and/or sort=amount&type=spending. Returns totalMatches and totalSpending/totalIncome—one call only, never repeat with tweaked args. Prefer merchant over text.",
		inputSchema: searchTransactionsInput,
		run: (userId, input: z.infer<typeof searchTransactionsInput>) =>
			searchTransactionsForUser(userId, input),
	},
	{
		name: "spendingSummary",
		description:
			"Custom date-range aggregates (category, merchant, or month). financialOverview already covers this month and last month by category—use spendingSummary only for other ranges (e.g. full year) or month-by-month trends.",
		inputSchema: spendingSummaryInput,
		run: (userId, input: z.infer<typeof spendingSummaryInput>) =>
			spendingSummaryForUser(userId, input),
	},
	{
		name: "getBudgets",
		description:
			"Budget limits only. financialOverview already includes limits with spent amounts—do not call getBudgets after financialOverview.",
		inputSchema: emptyInput,
		run: (userId) => getBudgetsForUser(userId),
	},
	{
		name: "getSubscriptions",
		description:
			"Full subscription list with per-item amounts. financialOverview includes monthlyTotal, yearlyTotal, and upcoming renewals—call getSubscriptions only when the user needs every plan listed or amounts per cycle.",
		inputSchema: emptyInput,
		run: (userId) => getSubscriptionsForUser(userId),
	},
	{
		name: "getGoals",
		description:
			"Goal progress plus savings-account balance context. One call covers goal status; do not add listAccounts for savings unless accounts outside goals are required.",
		inputSchema: emptyInput,
		run: (userId) => getGoalsForUser(userId),
	},
]

/** Read-only AI tools scoped to one Ledger user (duplicate calls in one turn share one execution). */
export function createChatTools(userId: string) {
	const inFlight = new Map<string, Promise<unknown>>()
	return Object.fromEntries(
		financeToolDefinitions.map((definition) => [
			definition.name,
			tool({
				description: definition.description,
				inputSchema: definition.inputSchema,
				execute: async (input) =>
					memoizeToolExecute(
						inFlight,
						stableToolCallKey(definition.name, input),
						() => definition.run(userId, input as never)
					),
			}),
		])
	) as unknown as Record<string, ReturnType<typeof tool>>
}
