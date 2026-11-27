import { AnimatedMoney } from "@/components/common/count-up"
import { InsightsStat } from "@/components/insights/insights-stat"
import type { useInsightsPage } from "@/components/insights/use-insights-page"
import { formatMoney } from "@/lib/format"

type InsightsPageState = ReturnType<typeof useInsightsPage>

/** Top stat cards on the insights page. */
export function InsightsPageStats({ page }: { page: InsightsPageState }) {
	return (
		<>
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
		</>
	)
}
