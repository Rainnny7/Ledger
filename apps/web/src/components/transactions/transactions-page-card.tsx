import type { useTransactionsPage } from "@/components/transactions/use-transactions-page"
import { TransactionsBulkToolbar } from "@/components/transactions/transactions-bulk-toolbar"
import { TransactionsFilterSelect } from "@/components/transactions/transactions-filter-select"
import { TransactionsTable } from "@/components/transactions/transactions-table"
import { TRANSACTIONS_PAGE } from "@/components/transactions/transactions-filter-items"
import { SearchInput } from "@/components/common/search-input"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Category } from "@/lib/api"
import type { RangeKey } from "@/lib/ranges"
import { formatMoney } from "@/lib/format"
import { ArrowDownLeft, ArrowUpRight, Download, X } from "lucide-react"

type Model = ReturnType<typeof useTransactionsPage>

/** React/UI entry: `TransactionsPageCard`. */
export function TransactionsPageCard({ model }: { model: Model }) {
	const {
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
		setLinks,
		since,
		limit,
		setLimit,
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
	} = model

	return (
		<Card className="gap-0 pb-0">
			<CardHeader className="gap-4 pb-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<CardTitle>
							{loading
								? "Loading…"
								: `${filtered.length.toLocaleString()} transactions`}
						</CardTitle>
						<CardDescription>
							{loading
								? " "
								: `of ${transactions.length.toLocaleString()}`}
							{totals.mixed && ` · totals in ${converter.home}`}
						</CardDescription>
					</div>
					<div className="flex items-center gap-4 text-sm">
						<span className="flex items-center gap-1 text-emerald-600 tabular-nums dark:text-emerald-400">
							<ArrowDownLeft className="size-4" />{" "}
							{formatMoney(totals.moneyIn)}
						</span>
						<span className="flex items-center gap-1 text-muted-foreground tabular-nums">
							<ArrowUpRight className="size-4" />{" "}
							{formatMoney(totals.moneyOut)}
						</span>
						{totals.moneyIn > 0 && totals.moneyOut > 0 && (
							<span
								className="font-medium tabular-nums"
								title="Money in minus money out, so refunds cancel the charges they undo"
							>
								Net{" "}
								{formatMoney(
									totals.moneyIn - totals.moneyOut,
									converter.home,
									{
										sign: true,
									}
								)}
							</span>
						)}
						<Button
							variant="outline"
							size="sm"
							onClick={exportCsv}
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
							changed()
						}}
					/>
					<TransactionsFilterSelect
						items={accountItems}
						value={accountId}
						onChange={(next) => (setAccountId(next), changed())}
						className="w-44"
					/>
					<TransactionsFilterSelect
						items={periodOptions}
						value={since ? "since" : period}
						onChange={(next) => {
							if (next === "since") {
								return
							}
							if (since) {
								void setLinks({ from: null, to: null })
							}
							setPeriod(next as RangeKey)
							changed()
						}}
						className="w-36"
					/>
					<TransactionsFilterSelect
						items={transactionCategoryItems}
						value={category}
						onChange={(next) => (
							setCategory(next as Category | "all"),
							changed()
						)}
						className="w-44"
					/>
					<TransactionsFilterSelect
						items={transactionTagItems}
						value={tag}
						onChange={(next) => (
							setTag(next as typeof tag),
							changed()
						)}
						className="w-36"
					/>
					<Tabs
						value={flow}
						onValueChange={(next) => (
							setFlow(next as typeof flow),
							changed()
						)}
					>
						<TabsList>
							<TabsTrigger value="all">All</TabsTrigger>
							<TabsTrigger value="in">In</TabsTrigger>
							<TabsTrigger value="out">Out</TabsTrigger>
						</TabsList>
					</Tabs>
					{filtersOn && (
						<Button
							variant="ghost"
							size="sm"
							onClick={clearFilters}
						>
							<X /> Clear
						</Button>
					)}
				</div>
				{merchantNames.length > 0 && (
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span className="text-muted-foreground">Only</span>
						<span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5">
							{merchantNames.length <= 3
								? merchantNames.join(", ")
								: `${merchantNames.slice(0, 2).join(", ")} and ${merchantNames.length - 2} more`}
							<Button
								variant="ghost"
								size="icon-xs"
								className="rounded-full"
								aria-label="Show every merchant"
								onClick={() => (
									void setLinks({ merchants: null }),
									changed()
								)}
							>
								<X />
							</Button>
						</span>
					</div>
				)}
				<TransactionsBulkToolbar
					shownCount={shown.length}
					filteredCount={filtered.length}
					allShownPicked={allShownPicked}
					pickedCount={picked.size}
					applying={applying}
					onToggleAll={() =>
						setPicked(
							allShownPicked
								? new Set()
								: new Set(
										shown.map(
											(transaction) => transaction.id
										)
									)
						)
					}
					onRecategorize={(value) => void recategorize(value)}
					onRetag={(value) => void retag(value)}
				/>
			</CardHeader>
			<CardContent className="px-0">
				{loading ? (
					<div className="grid gap-2 px-4 pb-4">
						{Array.from({ length: 8 }, (_, i) => (
							<Skeleton key={i} className="h-12" />
						))}
					</div>
				) : filtered.length === 0 ? (
					<p className="px-4 py-12 text-center text-sm text-muted-foreground">
						{transactions.length === 0
							? "No transactions yet. Connect a bank to see them here."
							: "No transactions match."}
					</p>
				) : (
					<TransactionsTable
						transactions={shown}
						accounts={accounts}
						onSelect={setSelected}
						showAccount={accounts.length > 1}
						selection={{ ids: picked, toggle }}
					/>
				)}
				{filtered.length > limit && (
					<div className="border-t p-3 text-center">
						<Button
							variant="ghost"
							size="sm"
							onClick={() =>
								setLimit(
									(currentLimit) =>
										currentLimit + TRANSACTIONS_PAGE
								)
							}
						>
							Show{" "}
							{Math.min(
								TRANSACTIONS_PAGE,
								filtered.length - limit
							)}{" "}
							more
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
