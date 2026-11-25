import type { Category, Cycle, Transaction } from "../api"
import { CATEGORY_META, NON_SPEND } from "../categories"
import { parseCustomCycle } from "../cycles"
import { formatMoney as formatCurrency } from "../format"
import type { MonthFigures } from "./types"

/** Round to the nearest whole number (advisor copy avoids false cents). */
export const roundToWhole = (value: number) => Math.round(value)
/** Format currency for advisor tip bodies. */
export const formatMoney = (amount: number) => formatCurrency(amount)
/** Whole-currency figure for estimates, where cents would imply false precision. */
export const about = (amount: number) =>
	formatCurrency(Math.round(amount)).replace(/\.00$/, "")
/** Format a unitless ratio as a whole-percent string. */
export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)}%`
/** Count with singular/plural label, e.g. "1 charge" vs "3 charges". */
export const plural = (count: number, one: string, many = `${one}s`) =>
	`${count} ${count === 1 ? one : many}`
/** Human label for a spending category. */
export const label = (category: Category) => CATEGORY_META[category].label
/** Lowercase category label; food reads as "eating out" in tips. */
export const lowercaseCategory = (category: Category) =>
	category === "food" ? "eating out" : label(category).toLowerCase()

/** Spending categories count toward discretionary analysis; income and transfers do not. */
export const isSpend = (transaction: Transaction) =>
	!NON_SPEND.has(transaction.category)

/** A link to a page already filtered to what a tip is about (empty values are left out). */
export function link(
	path: string,
	params: Record<string, string | undefined> = {}
) {
	const query = new URLSearchParams()
	for (const [key, value] of Object.entries(params)) {
		if (value) {
			query.set(key, value)
		}
	}
	const queryString = query.toString()
	return queryString ? `${path}?${queryString}` : path
}

/** The distinct merchants behind some transactions, for the Transactions page's `merchants` filter. */
export const merchantsOf = (transactions: Transaction[]) =>
	[
		...new Set(transactions.map((transaction) => transaction.merchantKey)),
	].join(",")

/** The Subscriptions page with these plans (or spotted charges) highlighted. */
export const subsLink = (linkLabel: string, ids: string[]) => ({
	label: linkLabel,
	to: link("/subscriptions", { focus: ids.join(",") }),
})
/** YYYY-MM portion of an ISO date. */
export const monthOf = (iso: string) => iso.slice(0, 7)
/** Day-of-month (1–31) from an ISO date. */
export const dayOf = (iso: string) => Number(iso.slice(8, 10))
/** Calendar days in the month keyed by YYYY-MM. */
export const daysInMonth = (monthKey: string) => {
	const [year, month] = monthKey.split("-").map(Number)
	return new Date(year, month, 0).getDate()
}
/** Month key `n` months before `monthKey` (default one). */
export const prevMonth = (monthKey: string, monthsBack = 1) => {
	const [year, month] = monthKey.split("-").map(Number)
	const date = new Date(year, month - 1 - monthsBack, 1)
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}
/** English ordinal suffix for tip copy (1st, 2nd, 3rd). */
export const ordinal = (index: number) => {
	const suffix =
		index % 100 >= 11 && index % 100 <= 13
			? "th"
			: (["th", "st", "nd", "rd"][index % 10] ?? "th")
	return `${index}${suffix}`
}
/** Clamp a value to the unit interval [0, 1]. */
export const clampToUnit = (value: number) => Math.max(0, Math.min(1, value))

const PRESET_PER_YEAR: Record<string, number> = {
	weekly: 52,
	biweekly: 26,
	monthly: 12,
	quarterly: 4,
	semiannual: 2,
	yearly: 1,
	biennial: 0.5,
	triennial: 1 / 3,
}

/** How many times a year a cycle bills. */
export function chargesPerYear(cycle: Cycle) {
	if (cycle in PRESET_PER_YEAR) {
		return PRESET_PER_YEAR[cycle]
	}
	const custom = parseCustomCycle(cycle)
	if (!custom) {
		return 12
	}
	return custom.unit === "weeks"
		? 52 / custom.every
		: custom.unit === "months"
			? 12 / custom.every
			: 1 / custom.every
}

/** Net spending (refunds cancel charges) per category over a set of transactions. */
export function spendBy(transactions: Transaction[]) {
	const map = new Map<Category, number>()
	for (const transaction of transactions) {
		if (isSpend(transaction)) {
			map.set(
				transaction.category,
				(map.get(transaction.category) ?? 0) - transaction.amount
			)
		}
	}
	return map
}

/** Money spent on things you choose day to day (not rent, bills or fees). */
export const DISCRETIONARY: ReadonlySet<Category> = new Set([
	"food",
	"shopping",
	"entertainment",
	"transport",
	"cash",
	"other",
])

/** Income, spending, debt payments, and net for one calendar month. */
export function monthFigures(
	transactions: Transaction[],
	month: string
): MonthFigures {
	let income = 0
	let spent = 0
	let debt = 0
	for (const transaction of transactions) {
		if (monthOf(transaction.date) !== month) {
			continue
		}
		if (transaction.category === "income") {
			income += transaction.amount
		} else if (transaction.category === "debt") {
			debt -= transaction.amount
		} else if (isSpend(transaction)) {
			spent -= transaction.amount
		}
	}
	income = Math.max(0, income)
	spent = Math.max(0, spent)
	debt = Math.max(0, debt)
	return {
		month,
		income,
		spent,
		debt,
		out: spent + debt,
		net: income - spent - debt,
	}
}
