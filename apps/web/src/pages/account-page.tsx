import { useMemo, useState } from "react"
import { useParams } from "@tanstack/react-router"
import { AccountBackLink } from "@/components/accounts/account-back-link"
import { AccountDetailsButton } from "@/components/accounts/account-details-dialog"
import { accountPeriodItems } from "@/components/accounts/account-filter-items"
import { AccountStatCards } from "@/components/accounts/account-stat-cards"
import { AccountTransactionsCard } from "@/components/accounts/account-transactions-card"
import {
	isDebtAccount,
	shownRunningBalance,
	useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { BalanceChart, CategoryBars } from "@/components/common/charts"
import { RangePicker } from "@/components/common/range-picker"
import { RANGES, type RangeKey, rangeStart, useRangeState } from "@/lib/ranges"
import { TransactionSheet } from "@/components/transactions/transaction-sheet"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { Account, Category, Transaction } from "@/lib/api"
import { CATEGORY_LIST, CATEGORY_META } from "@/lib/categories"
import { balanceSeries, downloadCsv, spendByCategory } from "@/lib/finance"
import { ACCOUNT_TYPE_LABEL, formatRelative } from "@/lib/format"
import { usePagination } from "@/components/transactions/use-pagination"
import { QueryError } from "@/components/ui/query-error"
import { useAccount } from "@/lib/queries"
import { useUrlState } from "@/lib/url-state"

type Flow = "all" | "in" | "out"

/** One account: balance trend, category breakdown, and transaction history. */
export function AccountPage() {
	const { id = "" } = useParams({ strict: false })
	const { data, error, reload } = useAccount(id)

	if (error && !data) {
		return (
			<div className="grid gap-4">
				<AccountBackLink />
				<QueryError
					message={error.message}
					onRetry={() => void reload()}
				/>
			</div>
		)
	}
	if (!data) {
		return (
			<div className="grid gap-6">
				<AccountBackLink />
				<Skeleton className="h-8 w-64" />
				<div className="grid gap-4 sm:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-24 rounded-xl" />
					))}
				</div>
				<Skeleton className="h-72 rounded-xl" />
				<Skeleton className="h-96 rounded-xl" />
			</div>
		)
	}

	return (
		<AccountView account={data.account} transactions={data.transactions} />
	)
}

function AccountView({
	account,
	transactions,
}: {
	account: Account
	transactions: Transaction[]
}) {
	// Filters live in the URL, so reloading or coming back to the account keeps them.
	const ranges = Object.keys(RANGES) as RangeKey[]
	const [query, setQuery] = useUrlState<string>("q", "")
	const [flow, setFlow] = useUrlState<Flow>("flow", "all", [
		"all",
		"in",
		"out",
	])
	const [category, setCategory] = useUrlState<Category | "all">(
		"category",
		"all",
		["all", ...CATEGORY_LIST]
	)
	const [period, setPeriod] = useUrlState<RangeKey>("period", "90d", ranges)
	const [chartRange, setChartRange] = useRangeState("chart", "90d")
	const [selected, setSelected] = useState<Transaction | null>(null)
	const includeOverdraft = useIncludeOverdraft()

	const from = rangeStart(period)
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase()
		return transactions.filter(
			(transaction) =>
				(!from || transaction.date >= from) &&
				(flow === "all" ||
					(flow === "in"
						? transaction.amount > 0
						: transaction.amount < 0)) &&
				(category === "all" || transaction.category === category) &&
				(!needle ||
					transaction.description.toLowerCase().includes(needle) ||
					transaction.merchant.toLowerCase().includes(needle) ||
					(transaction.note ?? "").toLowerCase().includes(needle) ||
					Math.abs(transaction.amount).toFixed(2).includes(needle))
		)
	}, [transactions, query, flow, category, from])

	const { page, perPage, totalPages, setPage, setPerPage, resetPage } =
		usePagination(filtered.length)
	const shown = filtered.slice((page - 1) * perPage, page * perPage)

	const totals = useMemo(() => {
		let moneyIn = 0
		let moneyOut = 0
		for (const transaction of filtered) {
			if (transaction.amount > 0) {
				moneyIn += transaction.amount
			} else {
				moneyOut += -transaction.amount
			}
		}
		return { moneyIn, moneyOut }
	}, [filtered])

	const series = useMemo(
		() =>
			balanceSeries(
				[account],
				transactions,
				rangeStart(chartRange),
				includeOverdraft
			),
		[account, transactions, chartRange, includeOverdraft]
	)
	const breakdown = useMemo(
		() =>
			spendByCategory(
				transactions.filter(
					(transaction) => !from || transaction.date >= from
				)
			),
		[transactions, from]
	)

	const debt = isDebtAccount(account)

	function exportCsv() {
		downloadCsv(
			`${account.name.replace(/[^\w]+/g, "-").toLowerCase()}-transactions.csv`,
			[
				[
					"Date",
					"Merchant",
					"Description",
					"Category",
					"Amount",
					"Balance",
					"Pending",
					"Note",
				],
				...filtered.map((transaction) => [
					transaction.date,
					transaction.merchant,
					transaction.description,
					CATEGORY_META[transaction.category].label,
					transaction.amount.toFixed(2),
					shownRunningBalance(
						transaction,
						account,
						includeOverdraft
					)?.toFixed(2),
					transaction.pending ? "yes" : "",
					transaction.note,
				]),
			]
		)
	}

	return (
		<div className="grid gap-6">
			<AccountBackLink />

			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-2xl font-semibold tracking-tight">
							{account.name}
						</h1>
						<Badge variant="secondary">
							{ACCOUNT_TYPE_LABEL[account.type]}
						</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						{account.numberMasked
							? `${account.numberMasked} · `
							: ""}
						{account.currency} · updated{" "}
						{formatRelative(account.updatedAt)}
					</p>
				</div>
				{account.type !== "wallet" && (
					<AccountDetailsButton account={account} />
				)}
			</div>

			<AccountStatCards account={account} />

			<div className="grid gap-4 lg:grid-cols-5">
				<Card className="lg:col-span-3">
					<CardHeader>
						<CardTitle>
							{debt
								? "Balance owing over time"
								: "Balance over time"}
						</CardTitle>
						<CardDescription>
							End-of-day balance, rebuilt from posted transactions
						</CardDescription>
						<CardAction>
							<RangePicker
								value={chartRange}
								onChange={setChartRange}
							/>
						</CardAction>
					</CardHeader>
					<CardContent>
						<BalanceChart
							data={series}
							currency={account.currency}
							from={rangeStart(chartRange)}
						/>
					</CardContent>
				</Card>
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>Where it went</CardTitle>
						<CardDescription>
							{
								accountPeriodItems.find(
									(preset) => preset.value === period
								)?.label
							}{" "}
							· tap to filter
						</CardDescription>
					</CardHeader>
					<CardContent>
						<CategoryBars
							data={breakdown.slice(0, 7)}
							selected={category === "all" ? null : category}
							onSelect={(pickedCategory) => {
								setCategory(
									category === pickedCategory
										? "all"
										: pickedCategory
								)
								resetPage()
							}}
						/>
					</CardContent>
				</Card>
			</div>

			<AccountTransactionsCard
				account={account}
				transactions={transactions}
				filtered={filtered}
				shown={shown}
				totals={totals}
				query={query}
				setQuery={setQuery}
				flow={flow}
				setFlow={setFlow}
				category={category}
				setCategory={setCategory}
				period={period}
				setPeriod={setPeriod}
				page={page}
				perPage={perPage}
				totalPages={totalPages}
				setPage={setPage}
				setPerPage={setPerPage}
				resetPage={resetPage}
				setSelected={setSelected}
				onExport={exportCsv}
			/>

			<TransactionSheet
				transaction={selected}
				transactions={transactions}
				accounts={[account]}
				onClose={() => setSelected(null)}
				onSelect={setSelected}
				// The save invalidates every query, so the list refreshes on its own.
				onUpdated={(transaction) => setSelected(transaction)}
			/>
		</div>
	)
}
