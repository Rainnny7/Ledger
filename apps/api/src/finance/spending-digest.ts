/**
 * The numbers behind the monthly spending digest email. Everything here is deterministic: it turns
 * a user's transactions (already in their base currency) into totals, shifts and flagged items for
 * one calendar month. The AI only ever writes prose around this output; it never produces a figure.
 */
import type { Category } from "@ledger/shared/categories"
import { roundMoney } from "@ledger/shared/money"
import { amountTolerance, detectRecurring } from "./recurring.ts"

/** A transaction as the digest sees it: amount already converted to the base currency, negative = money out. */
export interface DigestTransaction {
	date: string
	amount: number
	merchant: string
	merchantKey: string
	category: Category
}

/** Money in and out for one calendar month. */
export interface MonthTotals {
	/** YYYY-MM */
	month: string
	spent: number
	income: number
}

/** A category that moved a lot compared with the user's usual month. */
export interface CategoryShift {
	category: Category
	spent: number
	/** Average monthly spend over the previous three months. */
	average: number
	/** spent minus average (positive = spent more than usual). */
	change: number
}

/** Everything the digest says about one month. */
export interface SpendingDigest {
	/** The month covered, YYYY-MM. */
	period: string
	currency: string
	spent: number
	income: number
	net: number
	/** (income - spent) / income as a percentage with one decimal, or null when nothing came in. */
	savingsRate: number | null
	previousMonth: MonthTotals & { spentChangePercent: number | null }
	/** The three months ending with `period`, oldest first. */
	trend: MonthTotals[]
	/** `share` is a whole-number percentage of the month's spending. */
	topCategories: { category: Category; spent: number; share: number }[]
	categoryShifts: CategoryShift[]
	unusual: {
		newMerchants: { merchant: string; amount: number }[]
		largeOneOffs: {
			merchant: string
			date: string
			amount: number
			category: Category
		}[]
		possibleDuplicates: {
			merchant: string
			date: string
			amount: number
			count: number
		}[]
	}
	recurring: {
		newCharges: { name: string; amount: number; cycle: string }[]
		priceIncreases: {
			name: string
			from: number
			to: number
			cycle: string
		}[]
	}
}

/** Categories that are movement of money rather than spending. */
const NOT_SPENDING = new Set<Category>(["transfers", "income"])
const TOP_CATEGORY_COUNT = 5
const FLAGGED_ITEM_LIMIT = 3
const RECURRING_ITEM_LIMIT = 5
/** A category shift smaller than this much money is noise. */
const MIN_SHIFT_AMOUNT = 25
/** ...and so is one under this fraction of the category's usual spend. */
const MIN_SHIFT_FRACTION = 0.2
const MIN_NEW_MERCHANT_AMOUNT = 20
const MIN_LARGE_ONE_OFF_AMOUNT = 100
const LARGE_ONE_OFF_MEDIAN_MULTIPLE = 3
const MIN_DUPLICATE_AMOUNT = 5

/** The month `months` away from `period` (both YYYY-MM); negative goes back. */
export function shiftMonth(period: string, months: number): string {
	const [year, month] = period.split("-").map(Number)
	const shifted = new Date(Date.UTC(year, month - 1 + months, 1))
	return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`
}

/** The calendar month that just ended, given today's date (YYYY-MM-DD) in the user's zone. */
export function digestPeriodFor(today: string): string {
	return shiftMonth(today.slice(0, 7), -1)
}

/** First day (YYYY-MM-DD) of a YYYY-MM month. */
export const monthStart = (period: string) => `${period}-01`

/** Last day (YYYY-MM-DD) of a YYYY-MM month. */
export function monthEnd(period: string): string {
	const [year, month] = period.split("-").map(Number)
	return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function monthTotals(
	transactions: DigestTransaction[],
	month: string
): MonthTotals {
	let spent = 0
	let income = 0
	for (const transaction of transactions) {
		if (
			transaction.date.slice(0, 7) !== month ||
			transaction.category === "transfers"
		) {
			continue
		}
		if (transaction.amount < 0) {
			spent += -transaction.amount
		} else {
			income += transaction.amount
		}
	}
	return { month, spent: roundMoney(spent), income: roundMoney(income) }
}

const isSpending = (transaction: DigestTransaction) =>
	transaction.amount < 0 && !NOT_SPENDING.has(transaction.category)

function median(values: number[]): number {
	if (values.length === 0) {
		return 0
	}
	const sorted = values.toSorted((left, right) => left - right)
	return sorted[Math.floor(sorted.length / 2)]
}

function categorySpend(
	transactions: DigestTransaction[],
	month: string
): Map<Category, number> {
	const totals = new Map<Category, number>()
	for (const transaction of transactions) {
		if (transaction.date.slice(0, 7) === month && isSpending(transaction)) {
			totals.set(
				transaction.category,
				(totals.get(transaction.category) ?? 0) - transaction.amount
			)
		}
	}
	return totals
}

function categoryShifts(
	transactions: DigestTransaction[],
	period: string
): CategoryShift[] {
	const current = categorySpend(transactions, period)
	const earlier = [1, 2, 3].map((back) =>
		categorySpend(transactions, shiftMonth(period, -back))
	)
	// Months with no data at all (a new account) shouldn't drag the average down.
	const monthsWithData = earlier.filter((totals) => totals.size > 0).length
	if (monthsWithData === 0) {
		return []
	}
	const categories = new Set<Category>([
		...current.keys(),
		...earlier.flatMap((totals) => [...totals.keys()]),
	])
	const shifts: CategoryShift[] = []
	for (const category of categories) {
		const spent = current.get(category) ?? 0
		const average =
			earlier.reduce(
				(sum, totals) => sum + (totals.get(category) ?? 0),
				0
			) / monthsWithData
		const change = spent - average
		if (
			Math.abs(change) >= MIN_SHIFT_AMOUNT &&
			(average === 0 || Math.abs(change) / average >= MIN_SHIFT_FRACTION)
		) {
			shifts.push({
				category,
				spent: roundMoney(spent),
				average: roundMoney(average),
				change: roundMoney(change),
			})
		}
	}
	return shifts
		.toSorted(
			(left, right) => Math.abs(right.change) - Math.abs(left.change)
		)
		.slice(0, FLAGGED_ITEM_LIMIT)
}

function unusualItems(
	transactions: DigestTransaction[],
	period: string
): SpendingDigest["unusual"] {
	const start = monthStart(period)
	const recentStart = monthStart(shiftMonth(period, -3))
	const inPeriod = transactions.filter(
		(transaction) =>
			transaction.date.slice(0, 7) === period && isSpending(transaction)
	)
	const before = transactions.filter(
		(transaction) => transaction.date < start
	)

	// Without earlier history every merchant would look new.
	const knownMerchants = new Set(before.map((entry) => entry.merchantKey))
	const newByMerchant = new Map<
		string,
		{ merchant: string; amount: number }
	>()
	if (before.length > 0) {
		for (const transaction of inPeriod) {
			if (knownMerchants.has(transaction.merchantKey)) {
				continue
			}
			const entry = newByMerchant.get(transaction.merchantKey) ?? {
				merchant: transaction.merchant,
				amount: 0,
			}
			entry.amount += -transaction.amount
			newByMerchant.set(transaction.merchantKey, entry)
		}
	}
	const newMerchants = [...newByMerchant.values()]
		.filter((entry) => entry.amount >= MIN_NEW_MERCHANT_AMOUNT)
		.toSorted((left, right) => right.amount - left.amount)
		.slice(0, FLAGGED_ITEM_LIMIT)
		.map((entry) => ({ ...entry, amount: roundMoney(entry.amount) }))

	const recentSpending = before.filter(
		(transaction) =>
			transaction.date >= recentStart && isSpending(transaction)
	)
	const typical = median(
		[...recentSpending, ...inPeriod].map((entry) => -entry.amount)
	)
	const largeOneOffs = inPeriod
		.filter((transaction) => {
			const amount = -transaction.amount
			return (
				amount >= MIN_LARGE_ONE_OFF_AMOUNT &&
				amount >= typical * LARGE_ONE_OFF_MEDIAN_MULTIPLE &&
				// A bill that comes round every month is no surprise.
				!recentSpending.some(
					(earlierTransaction) =>
						earlierTransaction.merchantKey ===
							transaction.merchantKey &&
						Math.abs(-earlierTransaction.amount - amount) <=
							amountTolerance(amount)
				)
			)
		})
		.toSorted((left, right) => left.amount - right.amount)
		.slice(0, FLAGGED_ITEM_LIMIT)
		.map((transaction) => ({
			merchant: transaction.merchant,
			date: transaction.date,
			amount: roundMoney(-transaction.amount),
			category: transaction.category,
		}))

	const sameDay = new Map<string, DigestTransaction[]>()
	for (const transaction of inPeriod) {
		if (
			-transaction.amount < MIN_DUPLICATE_AMOUNT ||
			transaction.category === "cash"
		) {
			continue
		}
		const key = `${transaction.merchantKey}|${transaction.date}|${transaction.amount}`
		sameDay.set(key, [...(sameDay.get(key) ?? []), transaction])
	}
	const possibleDuplicates = [...sameDay.values()]
		.filter((group) => group.length > 1)
		.toSorted((left, right) => left[0].amount - right[0].amount)
		.slice(0, FLAGGED_ITEM_LIMIT)
		.map((group) => ({
			merchant: group[0].merchant,
			date: group[0].date,
			amount: roundMoney(-group[0].amount),
			count: group.length,
		}))

	return { newMerchants, largeOneOffs, possibleDuplicates }
}

function recurringChanges(
	transactions: DigestTransaction[],
	period: string
): SpendingDigest["recurring"] {
	const start = monthStart(period)
	const current = detectRecurring(
		transactions.filter((entry) => entry.date <= monthEnd(period)),
		monthEnd(period)
	)
	const previous = detectRecurring(
		transactions.filter((entry) => entry.date < start),
		monthEnd(shiftMonth(period, -1))
	)
	const previousKeys = new Set(previous.map((guess) => guess.merchantKey))
	const previousPlansByKey = new Map<string, typeof previous>()
	for (const guess of previous) {
		previousPlansByKey.set(guess.merchantKey, [
			...(previousPlansByKey.get(guess.merchantKey) ?? []),
			guess,
		])
	}

	const newCharges = current
		.filter((guess) => !previousKeys.has(guess.merchantKey))
		.toSorted((left, right) => right.amount - left.amount)
		.slice(0, RECURRING_ITEM_LIMIT)
		.map((guess) => ({
			name: guess.name,
			amount: roundMoney(guess.amount),
			cycle: guess.cycle,
		}))

	const priceIncreases: SpendingDigest["recurring"]["priceIncreases"] = []
	for (const [key, plans] of previousPlansByKey) {
		// Several plans under one merchant can't be matched up reliably.
		if (plans.length !== 1) {
			continue
		}
		const [plan] = plans
		const chargesBefore = transactions.filter(
			(entry) =>
				entry.merchantKey === key &&
				entry.amount < 0 &&
				entry.date < start
		)
		// Only a fixed-price plan has a "price" to raise: metered bills move around every month.
		const fixedPrice =
			chargesBefore.length >= 2 &&
			chargesBefore
				.slice(-3)
				.every(
					(entry) =>
						Math.round(entry.amount * 100) ===
						Math.round(chargesBefore.at(-1)!.amount * 100)
				)
		const latest = transactions
			.filter(
				(entry) =>
					entry.merchantKey === key &&
					entry.amount < 0 &&
					entry.date.slice(0, 7) === period
			)
			.at(-1)
		if (!fixedPrice || !latest) {
			continue
		}
		const from = -chargesBefore.at(-1)!.amount
		const to = -latest.amount
		if (to > from * 1.03 && to - from >= 0.5 && to <= from * 2) {
			priceIncreases.push({
				name: plan.name,
				from: roundMoney(from),
				to: roundMoney(to),
				cycle: plan.cycle,
			})
		}
	}
	priceIncreases.sort(
		(left, right) => right.to - right.from - (left.to - left.from)
	)
	return {
		newCharges,
		priceIncreases: priceIncreases.slice(0, RECURRING_ITEM_LIMIT),
	}
}

/**
 * Computes the digest for `period` from the user's full history up to the end of that month.
 *
 * @param transactions Every transaction up to the end of `period`, in the base currency.
 * @param period The month to summarise, YYYY-MM.
 * @param currency ISO code of the currency the amounts are in.
 */
export function computeSpendingDigest(
	transactions: DigestTransaction[],
	period: string,
	currency: string
): SpendingDigest {
	const current = monthTotals(transactions, period)
	const previous = monthTotals(transactions, shiftMonth(period, -1))
	const topCategories = [...categorySpend(transactions, period).entries()]
		.toSorted((left, right) => right[1] - left[1])
		.slice(0, TOP_CATEGORY_COUNT)
		.map(([category, spent]) => ({
			category,
			spent: roundMoney(spent),
			share:
				current.spent > 0
					? Math.round((spent / current.spent) * 100)
					: 0,
		}))
	return {
		period,
		currency,
		spent: current.spent,
		income: current.income,
		net: roundMoney(current.income - current.spent),
		savingsRate:
			current.income > 0
				? Math.round(
						((current.income - current.spent) / current.income) *
							1000
					) / 10
				: null,
		previousMonth: {
			...previous,
			spentChangePercent:
				previous.spent > 0
					? Math.round(
							((current.spent - previous.spent) /
								previous.spent) *
								100
						)
					: null,
		},
		trend: [-2, -1, 0].map((back) =>
			monthTotals(transactions, shiftMonth(period, back))
		),
		topCategories,
		categoryShifts: categoryShifts(transactions, period),
		unusual: unusualItems(transactions, period),
		recurring: recurringChanges(transactions, period),
	}
}
