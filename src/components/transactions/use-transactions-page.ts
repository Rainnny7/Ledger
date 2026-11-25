import {
	bulkRecategorize,
	bulkRetag,
} from "@/components/transactions/transactions-page-bulk"
import { filterTransactions } from "@/components/transactions/transactions-page-filter"
import {
	TRANSACTIONS_PAGE,
	transactionCategoryItems,
	transactionPeriodItems,
	transactionTagItems,
} from "@/components/transactions/transactions-filter-items"
import { useTransactionsUrl } from "@/components/transactions/use-transactions-url"
import { type Transaction } from "@/lib/api"
import { CATEGORY_META, TAX_TAG_META } from "@/lib/categories"
import { inHomeCurrency, useConverter } from "@/lib/currency"
import { downloadCsv } from "@/lib/finance"
import { formatShortDate } from "@/lib/format"
import { useOverview, useTransactions } from "@/lib/queries"
import { useIntent } from "@/lib/url-state"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

/** React/UI entry: `useTransactionsPage`. */
export function useTransactionsPage() {
	const overview = useOverview()
	const txq = useTransactions(null)
	const converter = useConverter()
	const url = useTransactionsUrl()
	const {
		query,
		setQuery,
		accountId,
		setAccountId,
		category,
		setCategory,
		flow,
		setFlow,
		period,
		setPeriod,
		tag,
		setTag,
		links,
		setLinks,
		merchantKeys,
		since,
		until,
	} = url

	const [limit, setLimit] = useState(TRANSACTIONS_PAGE)
	const [selected, setSelected] = useState<Transaction | null>(null)
	const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
	const [applying, setApplying] = useState(false)
	const lastPicked = useRef<string | null>(null)

	const accounts = useMemo(
		() => overview.data?.accounts ?? [],
		[overview.data]
	)
	const transactions = useMemo(() => txq.data?.transactions ?? [], [txq.data])
	const accountItems = useMemo(
		() => [
			{ value: "all", label: "All accounts" },
			...accounts.map((account) => ({
				value: account.id,
				label: account.name,
			})),
		],
		[accounts]
	)

	const filtered = useMemo(
		() =>
			filterTransactions(transactions, {
				query,
				accountId,
				flow,
				category,
				tag,
				merchantKeys,
				since,
				until,
				period,
			}),
		[
			transactions,
			query,
			accountId,
			flow,
			category,
			since,
			until,
			tag,
			merchantKeys,
			period,
		]
	)

	const totals = useMemo(() => {
		const home = inHomeCurrency(accounts, filtered, converter)
		let moneyIn = 0
		let moneyOut = 0
		for (const transaction of home.transactions) {
			if (transaction.amount > 0) {
				moneyIn += transaction.amount
			} else {
				moneyOut -= transaction.amount
			}
		}
		return { moneyIn, moneyOut, mixed: home.mixed }
	}, [accounts, filtered, converter])

	const shown = filtered.slice(0, limit)
	const pickedShown = shown.filter((row) => picked.has(row.id))
	const allShownPicked =
		shown.length > 0 && pickedShown.length === shown.length
	const filtersOn =
		query ||
		accountId !== "all" ||
		category !== "all" ||
		flow !== "all" ||
		tag !== "all" ||
		merchantKeys.size > 0 ||
		since
	const merchantNames = useMemo(() => {
		const names = new Map<string, string>()
		for (const transaction of transactions) {
			if (
				merchantKeys.has(transaction.merchantKey) &&
				!names.has(transaction.merchantKey)
			) {
				names.set(transaction.merchantKey, transaction.merchant)
			}
		}
		return [...names.values()]
	}, [transactions, merchantKeys])
	const sinceLabel = until
		? `${formatShortDate(since!)} – ${formatShortDate(until)}`
		: `Since ${formatShortDate(since ?? "")}`
	const periodOptions = since
		? [{ value: "since", label: sinceLabel }, ...transactionPeriodItems]
		: transactionPeriodItems

	function changed() {
		setLimit(TRANSACTIONS_PAGE)
		setPicked(new Set())
		lastPicked.current = null
	}

	function toggle(row: Transaction, range: boolean) {
		setPicked((cur) => {
			const next = new Set(cur)
			const on = !cur.has(row.id)
			const startIndex = lastPicked.current
				? shown.findIndex(
						(shownRow) => shownRow.id === lastPicked.current
					)
				: -1
			const endIndex = shown.findIndex(
				(shownRow) => shownRow.id === row.id
			)
			if (range && startIndex >= 0 && endIndex >= 0) {
				for (const shownRow of shown.slice(
					Math.min(startIndex, endIndex),
					Math.max(startIndex, endIndex) + 1
				)) {
					if (on) {
						next.add(shownRow.id)
					} else {
						next.delete(shownRow.id)
					}
				}
			} else if (on) {
				next.add(row.id)
			} else {
				next.delete(row.id)
			}
			return next
		})
		lastPicked.current = row.id
	}

	async function recategorize(value: string) {
		setApplying(true)
		try {
			const ok = await bulkRecategorize([...picked], value)
			if (ok) {
				setPicked(new Set())
			}
		} catch (error) {
			toast.error((error as Error).message)
		} finally {
			setApplying(false)
		}
	}

	async function retag(value: string) {
		setApplying(true)
		try {
			await bulkRetag([...picked], value)
			setPicked(new Set())
		} catch (error) {
			toast.error((error as Error).message)
		} finally {
			setApplying(false)
		}
	}

	useIntent(
		"tx",
		(id) => {
			const row = transactions.find((entry) => entry.id === id)
			if (row) {
				setSelected(row)
			}
		},
		!!txq.data
	)

	function exportCsv() {
		const byId = new Map(accounts.map((account) => [account.id, account]))
		downloadCsv("transactions.csv", [
			[
				"Date",
				"Account",
				"Merchant",
				"Description",
				"Category",
				"Tax tag",
				"Amount",
				"Currency",
				"Pending",
				"Note",
			],
			...filtered.map((transaction) => [
				transaction.date,
				byId.get(transaction.accountId)?.name,
				transaction.merchant,
				transaction.description,
				CATEGORY_META[transaction.category].label,
				transaction.taxTag
					? TAX_TAG_META[transaction.taxTag].label
					: "",
				transaction.amount.toFixed(2),
				byId.get(transaction.accountId)?.currency,
				transaction.pending ? "yes" : "",
				transaction.note,
			]),
		])
	}

	useIntent("export", () => exportCsv(), !!txq.data && !!overview.data)

	const loading = !txq.data || !overview.data

	function clearFilters() {
		setQuery("")
		setAccountId("all")
		setCategory("all")
		setFlow("all")
		setTag("all")
		void setLinks(null)
		changed()
	}

	return {
		overview,
		txq,
		converter,
		query,
		setQuery,
		accountId,
		setAccountId,
		category,
		setCategory,
		flow,
		setFlow,
		period,
		setPeriod,
		tag,
		setTag,
		links,
		setLinks,
		since,
		limit,
		setLimit,
		selected,
		setSelected,
		picked,
		setPicked,
		applying,
		accounts,
		transactions,
		accountItems,
		filtered,
		totals,
		shown,
		allShownPicked,
		filtersOn,
		merchantNames,
		periodOptions,
		changed,
		toggle,
		recategorize,
		retag,
		exportCsv,
		loading,
		clearFilters,
		transactionCategoryItems,
		transactionTagItems,
	}
}
