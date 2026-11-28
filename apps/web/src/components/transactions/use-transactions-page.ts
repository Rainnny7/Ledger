import {
	bulkRecategorize,
	bulkRetag,
} from "@/components/transactions/transactions-page-bulk"
import { filterTransactions } from "@/components/transactions/transactions-page-filter"
import {
	transactionCategoryItems,
	transactionPeriodItems,
	transactionTagItems,
} from "@/components/transactions/transactions-filter-items"
import {
	shownRunningBalance,
	useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { usePagination } from "@/components/transactions/use-pagination"
import { useTransactionsUrl } from "@/components/transactions/use-transactions-url"
import { type Transaction } from "@/lib/api"
import { CATEGORY_META, TAX_TAG_META } from "@/lib/categories"
import { inHomeCurrency } from "@/lib/currency"
import { useConverter } from "@/lib/converter-provider"
import { downloadCsv } from "@/lib/finance"
import { formatShortDate } from "@/lib/format"
import { useOverview, useTransactions } from "@/lib/queries"
import { useIntent } from "@/lib/url-state"
import { useCallback, useMemo, useRef, useState } from "react"
import { toastError } from "@/lib/toast"

const EMPTY_PICKED: ReadonlySet<string> = new Set()

/**
 * State for the Accounts page's transactions card: URL-backed filters, paging, bulk selection and
 * CSV export, scoped to one account or to all of them.
 *
 * @param accountId The account picked in the route, or null for every account.
 */
export function useTransactionsPage(accountId: string | null) {
	const overview = useOverview()
	const txq = useTransactions(null)
	const converter = useConverter()
	const includeOverdraft = useIncludeOverdraft()
	const url = useTransactionsUrl()
	const {
		query,
		setQuery,
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

	const [selected, setSelected] = useState<Transaction | null>(null)
	const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
	const [applying, setApplying] = useState(false)
	const lastPicked = useRef<string | null>(null)
	const [previousAccountId, setPreviousAccountId] = useState(accountId)
	// Reset during render (not in an effect) so a switched account never shows the old picks or sheet.
	if (accountId !== previousAccountId) {
		setPreviousAccountId(accountId)
		setSelected(null)
		setPicked(EMPTY_PICKED)
		lastPicked.current = null
	}

	const accounts = useMemo(
		() => overview.data?.accounts ?? [],
		[overview.data]
	)
	const transactions = useMemo(() => txq.data?.transactions ?? [], [txq.data])
	const account = useMemo(
		() => accounts.find((candidate) => candidate.id === accountId) ?? null,
		[accounts, accountId]
	)
	const accountTransactions = useMemo(
		() =>
			accountId
				? transactions.filter(
						(transaction) => transaction.accountId === accountId
					)
				: transactions,
		[transactions, accountId]
	)

	const filtered = useMemo(
		() =>
			filterTransactions(transactions, {
				query,
				accountId: accountId ?? "all",
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

	const pagination = usePagination(filtered.length)
	const { page, perPage, totalPages, setPage, setPerPage, resetPage } =
		pagination
	const shown = filtered.slice((page - 1) * perPage, page * perPage)
	const shownRef = useRef(shown)
	shownRef.current = shown

	const pickedShown = shown.filter((row) => picked.has(row.id))
	const allShownPicked =
		shown.length > 0 && pickedShown.length === shown.length
	const filtersOn =
		query ||
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
		resetPage()
		setPicked(new Set())
		lastPicked.current = null
	}

	const toggle = useCallback((row: Transaction, range: boolean) => {
		setPicked((cur) => {
			const shownIds = new Set(shownRef.current.map((entry) => entry.id))
			const next = new Set<string>()
			for (const id of cur) {
				if (shownIds.has(id)) {
					next.add(id)
				}
			}
			const on = !next.has(row.id)
			const shown = shownRef.current
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
	}, [])

	async function recategorize(value: string) {
		setApplying(true)
		try {
			const ok = await bulkRecategorize([...picked], value)
			if (ok) {
				setPicked(new Set())
			}
		} catch (error) {
			toastError((error as Error).message)
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
			toastError((error as Error).message)
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
		const byId = new Map(
			accounts.map((candidate) => [candidate.id, candidate])
		)
		const header = [
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
		]
		downloadCsv(
			account
				? `${account.name.replace(/[^\w]+/g, "-").toLowerCase()}-transactions.csv`
				: "transactions.csv",
			[
				account ? [...header, "Balance"] : header,
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
					...(account
						? [
								shownRunningBalance(
									transaction,
									account,
									includeOverdraft
								)?.toFixed(2),
							]
						: []),
				]),
			]
		)
	}

	useIntent("export", () => exportCsv(), !!txq.data && !!overview.data)

	const loading = !txq.data || !overview.data

	function clearFilters() {
		setQuery("")
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
		until,
		page,
		perPage,
		totalPages,
		setPage,
		setPerPage,
		selected,
		setSelected,
		picked: picked,
		setPicked,
		applying,
		accounts,
		transactions,
		account,
		accountTransactions,
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
