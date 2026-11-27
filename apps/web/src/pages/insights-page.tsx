import { QueryError } from "@/components/ui/query-error"
import { X } from "lucide-react"
import { AnimatedMoney } from "@/components/common/count-up"
import { CashflowChart, CategoryBars } from "@/components/common/charts"
import { BudgetsCard } from "@/components/dashboard/budgets-card"
import { RangePicker } from "@/components/common/range-picker"
import { InsightsMerchants } from "@/components/insights/insights-merchants"
import { InsightsStat } from "@/components/insights/insights-stat"
import {
	INSIGHTS_PAGE_SIZE,
	useInsightsPage,
} from "@/components/insights/use-insights-page"
import { TransactionSheet } from "@/components/transactions/transaction-sheet"
import { TransactionsTable } from "@/components/transactions/transactions-table"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CATEGORY_META } from "@/lib/categories"
import { formatMoney } from "@/lib/format"
import { AskLedgerButton } from "@/components/chat/ask-ledger-button"
import { rangeLabel } from "@/lib/ranges"

/** Spending patterns: merchants, categories, and month-over-month trends. */
export function InsightsPage() {
	const page = useInsightsPage()

	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Insights
					</h1>
					<p className="text-sm text-muted-foreground">
						Where your money goes, across every account. Transfers
						between accounts are ignored.
					</p>
				</div>
				<RangePicker
					value={page.range}
					onChange={(range) => {
						page.setRange(range)
						page.setLimit(INSIGHTS_PAGE_SIZE)
					}}
				/>
			</div>

			{page.txq.error && !page.txq.data && (
				<QueryError
					message={page.txq.error.message}
					onRetry={() => void page.txq.reload()}
				/>
			)}

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<InsightsStat
					label="Spent"
					value={<AnimatedMoney value={page.stats.spent} />}
					hint="Net of refunds; excludes transfers & loan payments"
					change={
						page.previous && {
							now: page.stats.spent,
							before: page.previous.spent,
							label: page.previous.label,
							goodWhenUp: false,
						}
					}
					loading={page.loading}
				/>
				<InsightsStat
					label="Income"
					value={<AnimatedMoney value={page.stats.income} />}
					hint="Pay and other money in"
					change={
						page.previous && {
							now: page.stats.income,
							before: page.previous.income,
							label: page.previous.label,
							goodWhenUp: true,
						}
					}
					loading={page.loading}
				/>
				<InsightsStat
					label="Net"
					value={<AnimatedMoney value={page.stats.net} sign />}
					negative={page.stats.net < 0}
					hint={
						page.stats.debt > 0
							? `Income − spent − ${formatMoney(page.stats.debt)} loan payments`
							: "Income − spent"
					}
					loading={page.loading}
				/>
				<InsightsStat
					label="Average Spend / Day"
					value={<AnimatedMoney value={page.stats.perDay} />}
					hint={`Over ${page.stats.days} days`}
					loading={page.loading}
				/>
			</div>
			{(page.home.mixed || page.home.skipped.length > 0) && (
				<p className="-mt-6 text-xs text-muted-foreground">
					Figures in {page.converter.home}, other currencies converted
					at today’s rates
					{page.home.skipped.length > 0 &&
						` · ${page.home.skipped.join(", ")} accounts left out until rates load`}
					.
				</p>
			)}

			<BudgetsCard
				transactions={page.home.transactions}
				converter={page.converter}
				loading={page.loading}
			/>

			<div className="grid gap-4 lg:grid-cols-5">
				<Card className="lg:col-span-3">
					<CardHeader>
						<CardTitle className="flex flex-wrap items-center gap-2">
							Spending by Category
							<AskLedgerButton
								variant="compact"
								label="Explain This Trend"
								prompt={`Explain my spending by category for ${rangeLabel(page.range)} (${page.stats.days} days). I spent ${formatMoney(page.stats.spent)} net of refunds. What changed vs the previous period and what should I watch?`}
							/>
						</CardTitle>
						<CardDescription>
							Click a category to filter merchants and
							transactions
						</CardDescription>
						{page.category && (
							<CardAction>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => page.setCategory(null)}
								>
									<X /> Clear
								</Button>
							</CardAction>
						)}
					</CardHeader>
					<CardContent>
						{page.loading ? (
							<Skeleton className="h-64" />
						) : (
							<CategoryBars
								data={page.categories}
								selected={page.category}
								onSelect={(category) => {
									page.setCategory((current) =>
										current === category ? null : category
									)
									page.setMerchant(null)
									page.setLimit(INSIGHTS_PAGE_SIZE)
								}}
							/>
						)}
					</CardContent>
				</Card>
				<InsightsMerchants
					loading={page.loading}
					merchants={page.merchants}
					category={page.category}
					merchant={page.merchant}
					onPick={(key) => {
						page.setMerchant((cur) => (cur === key ? null : key))
						page.setLimit(INSIGHTS_PAGE_SIZE)
					}}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex flex-wrap items-center gap-2">
						Cash Flow
						<AskLedgerButton
							variant="compact"
							label="Explain This Trend"
							prompt="Explain my cash flow trend over the last 12 months: months where I spent more than I earned, and what's driving the pattern."
						/>
					</CardTitle>
					<CardDescription>
						Money in vs out, last 12 months
					</CardDescription>
				</CardHeader>
				<CardContent>
					{page.loading ? (
						<Skeleton className="h-56" />
					) : (
						<CashflowChart data={page.flow} className="h-64" />
					)}
				</CardContent>
			</Card>

			<Card className="gap-0 pb-0">
				<CardHeader className="pb-4">
					<CardTitle>Transactions</CardTitle>
					<CardDescription>
						{page.list.length} transaction
						{page.list.length === 1 ? "" : "s"}
						{page.category
							? ` in ${CATEGORY_META[page.category].label}`
							: ""}
						{page.merchant
							? ` at ${page.merchants.find((entry) => entry.merchantKey === page.merchant)?.merchant ?? "this merchant"}`
							: ""}
					</CardDescription>
					{(page.category || page.merchant) && (
						<CardAction>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									page.setCategory(null)
									page.setMerchant(null)
								}}
							>
								<X /> Clear filters
							</Button>
						</CardAction>
					)}
				</CardHeader>
				<CardContent className="px-0">
					{page.list.length === 0 ? (
						<p className="py-10 text-center text-sm text-muted-foreground">
							No transactions in this period.
						</p>
					) : (
						<TransactionsTable
							transactions={page.list
								.slice(0, page.limit)
								.map(page.asRecorded)}
							accounts={page.accounts}
							onSelect={page.setSelected}
							showAccount
						/>
					)}
					{page.list.length > page.limit && (
						<div className="border-t p-3 text-center">
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									page.setLimit(
										(line) => line + INSIGHTS_PAGE_SIZE * 2
									)
								}
							>
								Show{" "}
								{Math.min(
									INSIGHTS_PAGE_SIZE * 2,
									page.list.length - page.limit
								)}{" "}
								more
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			<TransactionSheet
				transaction={page.selected}
				transactions={page.txq.data?.transactions ?? []}
				accounts={page.accounts}
				onClose={() => page.setSelected(null)}
				onSelect={page.setSelected}
				onUpdated={(transaction) => page.setSelected(transaction)}
			/>
		</div>
	)
}
