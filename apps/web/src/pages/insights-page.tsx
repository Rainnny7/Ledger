import { QueryError } from "@/components/ui/query-error"
import { RangePicker } from "@/components/common/range-picker"
import {
	INSIGHTS_PAGE_SIZE,
	useInsightsPage,
} from "@/components/insights/use-insights-page"
import { TransactionSheet } from "@/components/transactions/transaction-sheet"
import { InsightsPageBody } from "@/pages/insights-page-body"

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

			<InsightsPageBody page={page} />

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
