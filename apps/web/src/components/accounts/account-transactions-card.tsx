import { Money } from "@/components/common/money"
import { DownloadIcon } from "@/components/icons/download"
import { ArrowDownLeft, ArrowUpRight, History } from "lucide-react"
import {
	accountCategoryItems,
	accountPeriodItems,
} from "@/components/accounts/account-filter-items"
import { SearchInput } from "@/components/common/search-input"
import { TransactionsPagination } from "@/components/transactions/transactions-pagination"
import { TransactionsTable } from "@/components/transactions/transactions-table"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Account, Category, Transaction } from "@/lib/api"
import type { RangeKey } from "@/lib/ranges"
import { formatLongDate } from "@/lib/format"

type Flow = "all" | "in" | "out"

/** React/UI entry: `AccountTransactionsCard`. */
export function AccountTransactionsCard({
	account,
	transactions,
	filtered,
	shown,
	totals,
	query,
	setQuery,
	flow,
	setFlow,
	category,
	setCategory,
	period,
	setPeriod,
	page,
	perPage,
	totalPages,
	setPage,
	setPerPage,
	resetPage,
	setSelected,
	onExport,
}: {
	account: Account
	transactions: Transaction[]
	filtered: Transaction[]
	shown: Transaction[]
	totals: { moneyIn: number; moneyOut: number }
	query: string
	setQuery: (value: string) => void
	flow: Flow
	setFlow: (value: Flow) => void
	category: Category | "all"
	setCategory: (value: Category | "all") => void
	period: RangeKey
	setPeriod: (value: RangeKey) => void
	page: number
	perPage: number
	totalPages: number
	setPage: (page: number) => void
	setPerPage: (perPage: number) => void
	resetPage: () => void
	setSelected: (transaction: Transaction | null) => void
	onExport: () => void
}) {
	const earliest = transactions.at(-1)?.date

	return (
		<Card className="min-w-0 overflow-hidden">
			<CardHeader className="min-w-0 gap-4">
				<div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
					<div className="min-w-0">
						<CardTitle>Transactions</CardTitle>
						<CardDescription className="flex flex-wrap items-center gap-x-2">
							<span>
								{filtered.length.toLocaleString()} of{" "}
								{transactions.length.toLocaleString()}
							</span>
							{earliest && (
								<span className="inline-flex items-center gap-1">
									<History className="size-3" /> history from{" "}
									{formatLongDate(
										account.historyFrom &&
											account.historyFrom < earliest
											? account.historyFrom
											: earliest
									)}
								</span>
							)}
						</CardDescription>
					</div>
					<div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:w-auto">
						<span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
							<ArrowDownLeft className="size-4" />
							<span className="tabular-nums">
								<Money
									value={totals.moneyIn}
									currency={account.currency}
								/>
							</span>
						</span>
						<span className="flex items-center gap-1 text-muted-foreground">
							<ArrowUpRight className="size-4" />
							<span className="tabular-nums">
								<Money
									value={totals.moneyOut}
									currency={account.currency}
								/>
							</span>
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={onExport}
							disabled={filtered.length === 0}
						>
							<DownloadIcon size={24} className="flex" /> CSV
						</Button>
					</div>
				</div>
				<div className="grid min-w-0 grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
					<SearchInput
						placeholder="Search merchant, description, note or amount"
						value={query}
						onChange={(next) => {
							setQuery(next)
							resetPage()
						}}
						className="col-span-2 min-w-0 w-full md:col-span-1 md:min-w-48 md:flex-1"
					/>
					<Select
						items={accountPeriodItems}
						value={period}
						onValueChange={(next) => {
							if (next) {
								setPeriod(next as RangeKey)
							}
							resetPage()
						}}
					>
						<SelectTrigger className="min-w-0 w-full md:w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{accountPeriodItems.map((periodItem) => (
								<SelectItem
									key={periodItem.value}
									value={periodItem.value}
								>
									{periodItem.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select
						items={accountCategoryItems}
						value={category}
						onValueChange={(next) => {
							if (next) {
								setCategory(next as Category | "all")
							}
							resetPage()
						}}
					>
						<SelectTrigger className="min-w-0 w-full md:w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{accountCategoryItems.map((categoryItem) => (
								<SelectItem
									key={categoryItem.value}
									value={categoryItem.value}
								>
									{categoryItem.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Tabs
						value={flow}
						onValueChange={(next) => {
							setFlow(next as Flow)
							resetPage()
						}}
						className="col-span-2 md:col-span-1"
					>
						<TabsList>
							<TabsTrigger value="all">All</TabsTrigger>
							<TabsTrigger value="in">In</TabsTrigger>
							<TabsTrigger value="out">Out</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>
			</CardHeader>
			<CardContent className="px-0">
				{filtered.length === 0 ? (
					<p className="px-4 py-12 text-center text-sm text-muted-foreground">
						{transactions.length === 0
							? "No transactions were found for this account yet."
							: "No transactions match."}
					</p>
				) : (
					<>
						<TransactionsTable
							transactions={shown}
							accounts={[account]}
							onSelect={setSelected}
							showBalance={transactions.some(
								(row) => row.runningBalance !== null
							)}
						/>
						<TransactionsPagination
							page={page}
							totalPages={totalPages}
							totalCount={filtered.length}
							perPage={perPage}
							onPageChange={setPage}
							onPerPageChange={setPerPage}
						/>
					</>
				)}
			</CardContent>
		</Card>
	)
}
