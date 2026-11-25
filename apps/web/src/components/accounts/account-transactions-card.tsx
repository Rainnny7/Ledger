import { Money } from "@/components/common/money"
import { ArrowDownLeft, ArrowUpRight, Download, History } from "lucide-react"
import {
	accountCategoryItems,
	accountPeriodItems,
} from "@/components/accounts/account-filter-items"
import { SearchInput } from "@/components/common/search-input"
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
	totals,
	query,
	setQuery,
	flow,
	setFlow,
	category,
	setCategory,
	period,
	setPeriod,
	limit,
	setLimit,
	setSelected,
	pageSize,
	onExport,
}: {
	account: Account
	transactions: Transaction[]
	filtered: Transaction[]
	totals: { moneyIn: number; moneyOut: number }
	query: string
	setQuery: (value: string) => void
	flow: Flow
	setFlow: (value: Flow) => void
	category: Category | "all"
	setCategory: (value: Category | "all") => void
	period: RangeKey
	setPeriod: (value: RangeKey) => void
	limit: number
	setLimit: (value: number | ((limit: number) => number)) => void
	setSelected: (transaction: Transaction | null) => void
	pageSize: number
	onExport: () => void
}) {
	const earliest = transactions.at(-1)?.date

	function resetLimit() {
		setLimit(pageSize)
	}

	return (
		<Card>
			<CardHeader className="gap-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
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
					<div className="flex items-center gap-4 text-sm">
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
							<Download /> CSV
						</Button>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<SearchInput
						placeholder="Search merchant, description, note or amount"
						value={query}
						onChange={(next) => {
							setQuery(next)
							resetLimit()
						}}
					/>
					<Select
						items={accountPeriodItems}
						value={period}
						onValueChange={(next) => {
							if (next) {
								setPeriod(next as RangeKey)
							}
							resetLimit()
						}}
					>
						<SelectTrigger className="w-36">
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
							resetLimit()
						}}
					>
						<SelectTrigger className="w-44">
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
							resetLimit()
						}}
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
					<TransactionsTable
						transactions={filtered.slice(0, limit)}
						accounts={[account]}
						onSelect={setSelected}
						showBalance={transactions.some(
							(row) => row.runningBalance !== null
						)}
					/>
				)}
				{filtered.length > limit && (
					<div className="flex justify-center pt-4">
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setLimit((current) => current + pageSize)
							}
						>
							Show {Math.min(pageSize, filtered.length - limit)}{" "}
							more
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
