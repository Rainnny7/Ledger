import { X } from "lucide-react"
import { CashflowChart, CategoryBars } from "@/components/common/charts"
import { BudgetsCard } from "@/components/dashboard/budgets-card"
import { InsightsMerchants } from "@/components/insights/insights-merchants"
import {
	INSIGHTS_PAGE_SIZE,
	type useInsightsPage,
} from "@/components/insights/use-insights-page"
import { InsightsPageStats } from "@/pages/insights-page-stats"
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

type InsightsPageState = ReturnType<typeof useInsightsPage>

/** Insights charts, category breakdown, and transaction list. */
export function InsightsPageBody({ page }: { page: InsightsPageState }) {
	return (
		<>
			<InsightsPageStats page={page} />

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
		</>
	)
}
