import { useMemo, useState } from "react"
import { rangeDays, rangeLabel, rangeStart, useRangeState } from "@/lib/ranges"
import type { Category, Transaction } from "@/lib/api"
import { CATEGORY_LIST } from "@/lib/categories"
import { inHomeCurrency, useConverter } from "@/lib/currency"
import {
	isSpend,
	lastMonths,
	monthlyCashflow,
	spendByCategory,
	topMerchants,
	totalDebtPaid,
	totalIncome,
	totalSpent,
} from "@/lib/finance"
import { addDays, daysFromToday, isoDate } from "@/lib/format"
import { useOverview, useTransactions } from "@/lib/queries"
import { useUrlState } from "@/lib/url-state"

/** Transactions shown per page in the insights list. */
export const INSIGHTS_PAGE_SIZE = 50

/**
 * State and derived figures for the insights page: range, category and merchant filters,
 * period stats and comparison with the previous period.
 */
export function useInsightsPage() {
	const overview = useOverview()
	const txq = useTransactions(null)
	const [range, setRange] = useRangeState("range", "30d")
	const [categoryParam, setCategoryParam] = useUrlState<Category | "">(
		"category",
		"",
		CATEGORY_LIST
	)
	const [merchantParam, setMerchantParam] = useUrlState<string>(
		"merchant",
		""
	)
	const category = categoryParam || null
	const merchant = merchantParam || null
	const setCategory = (
		next: Category | null | ((cur: Category | null) => Category | null)
	) =>
		setCategoryParam(
			(typeof next === "function" ? next(category) : next) ?? ""
		)
	const setMerchant = (
		next: string | null | ((cur: string | null) => string | null)
	) =>
		setMerchantParam(
			(typeof next === "function" ? next(merchant) : next) ?? ""
		)
	const [selected, setSelected] = useState<Transaction | null>(null)
	const [limit, setLimit] = useState(INSIGHTS_PAGE_SIZE)

	const accounts = useMemo(
		() => overview.data?.accounts ?? [],
		[overview.data]
	)
	const converter = useConverter()
	const home = useMemo(
		() => inHomeCurrency(accounts, txq.data?.transactions ?? [], converter),
		[accounts, txq.data, converter]
	)
	const all = home.transactions
	const original = useMemo(
		() =>
			new Map(
				(txq.data?.transactions ?? []).map((transaction) => [
					transaction.id,
					transaction,
				])
			),
		[txq.data]
	)
	const asRecorded = (transaction: Transaction) =>
		original.get(transaction.id) ?? transaction
	const from = rangeStart(range)
	const inPeriod = useMemo(
		() => all.filter((transaction) => !from || transaction.date >= from),
		[all, from]
	)

	const stats = useMemo(() => {
		const spent = totalSpent(inPeriod)
		const income = totalIncome(inPeriod)
		const debt = totalDebtPaid(inPeriod)
		const earliest = inPeriod.at(-1)?.date ?? isoDate()
		const days = Math.max(
			1,
			-daysFromToday(from && from > earliest ? from : earliest) + 1
		)
		return {
			spent,
			income,
			debt,
			net: income - spent - debt,
			perDay: spent / days,
			days,
		}
	}, [inPeriod, from])

	const previous = useMemo(() => {
		const days = rangeDays(range)
		if (!days || !from) {
			return null
		}
		const prevFrom = addDays(from, -days)
		if (!all.length || all[all.length - 1].date > prevFrom) {
			return null
		}
		const previousTransactions = all.filter(
			(transaction) =>
				transaction.date >= prevFrom && transaction.date < from
		)
		return {
			spent: totalSpent(previousTransactions),
			income: totalIncome(previousTransactions),
			label: `vs previous ${rangeLabel(range)}`,
		}
	}, [all, from, range])

	const categories = useMemo(() => spendByCategory(inPeriod), [inPeriod])
	const merchants = useMemo(
		() =>
			topMerchants(
				category
					? inPeriod.filter(
							(transaction) => transaction.category === category
						)
					: inPeriod
			),
		[inPeriod, category]
	)
	const flow = useMemo(() => monthlyCashflow(all, lastMonths(12)), [all])

	const list = useMemo(
		() =>
			inPeriod.filter(
				(transaction) =>
					(category
						? transaction.category === category &&
							isSpend(transaction)
						: true) &&
					(merchant ? transaction.merchantKey === merchant : true)
			),
		[inPeriod, category, merchant]
	)

	const loading = !txq.data || !overview.data

	return {
		overview,
		txq,
		range,
		setRange,
		category,
		setCategory,
		merchant,
		setMerchant,
		selected,
		setSelected,
		limit,
		setLimit,
		accounts,
		converter,
		home,
		asRecorded,
		stats,
		previous,
		categories,
		merchants,
		flow,
		list,
		loading,
	}
}
