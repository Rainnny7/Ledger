import { useMemo, useState } from "react"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Transaction } from "@/lib/api"
import { CATEGORY_META } from "@/lib/categories"
import {
	spendByCategory,
	startOfMonth,
	topMerchants,
	totalSpent,
} from "@/lib/finance"
import { formatMoney, isoDate } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { cn } from "cn"

const BAR_COLORS = [
	"var(--chart-1)",
	"var(--chart-5)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-2)",
] as const

/** Categories shown as their own bar segment; the rest fold into "Everything else". */
const MAX_SEGMENTS = 5

/** One slice of the month's spending bar, with what the hover breakdown needs. */
type SpendSegment = {
	key: string
	label: string
	total: number
	count: number
	color: string
	merchants: { merchant: string; total: number }[]
}

/** Splits this month's spending into the top categories plus one "Everything else" slice. */
function buildSpendSegments(monthTransactions: Transaction[]): SpendSegment[] {
	const byCategory = spendByCategory(monthTransactions)
	const merchantsFor = (categories: Set<string>) =>
		topMerchants(
			monthTransactions.filter((transaction) =>
				categories.has(transaction.category)
			),
			3
		).map((row) => ({ merchant: row.merchant, total: row.total }))
	const segments: SpendSegment[] = byCategory
		.slice(0, MAX_SEGMENTS)
		.map((row, index) => ({
			key: row.category,
			label: CATEGORY_META[row.category].label,
			total: row.total,
			count: row.count,
			color: BAR_COLORS[index % BAR_COLORS.length],
			merchants: merchantsFor(new Set([row.category])),
		}))
	const rest = byCategory.slice(MAX_SEGMENTS)
	if (rest.length > 0) {
		segments.push({
			key: "rest",
			label: "Everything else",
			total: rest.reduce((sum, row) => sum + row.total, 0),
			count: rest.reduce((sum, row) => sum + row.count, 0),
			color: "var(--muted-foreground)",
			merchants: merchantsFor(new Set(rest.map((row) => row.category))),
		})
	}
	return segments
}

/**
 * Average spend across up to the three calendar months before the current one (same rules as
 * {@link totalSpent}).
 */
export function usualMonthlySpend(
	transactions: Transaction[],
	today: Date
): { usual: number; priorMonthCount: number } {
	const monthlyTotals: number[] = []
	for (let index = 1; index <= 3; index++) {
		const monthDate = new Date(
			today.getFullYear(),
			today.getMonth() - index,
			1
		)
		const monthStart = startOfMonth(monthDate)
		const monthEnd = isoDate(
			new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
		)
		const monthTx = transactions.filter(
			(transaction) =>
				!transaction.pending &&
				transaction.date >= monthStart &&
				transaction.date <= monthEnd
		)
		if (monthTx.length === 0) {
			continue
		}
		monthlyTotals.push(totalSpent(monthTx))
	}
	if (monthlyTotals.length === 0) {
		return { usual: 0, priorMonthCount: 0 }
	}
	const usual =
		monthlyTotals.reduce((sum, value) => sum + value, 0) /
		monthlyTotals.length
	return { usual, priorMonthCount: monthlyTotals.length }
}

/** This month’s spending vs your recent average, with a stacked category bar. */
export function DashboardMonthSoFarCard({
	transactions,
	txReady,
}: {
	transactions: Transaction[]
	txReady: boolean
}) {
	const now = useNow()
	const monthLabel = now.toLocaleDateString(undefined, { month: "long" })

	const { spentNow, segments, usual, showUsual } = useMemo(() => {
		const today = isoDate(now)
		const from = startOfMonth(now)
		const monthTx = transactions.filter(
			(transaction) =>
				!transaction.pending &&
				transaction.date >= from &&
				transaction.date <= today
		)
		const spent = totalSpent(monthTx)
		const { usual: usualValue, priorMonthCount } = usualMonthlySpend(
			transactions,
			now
		)
		return {
			spentNow: spent,
			segments: buildSpendSegments(monthTx),
			usual: usualValue,
			showUsual: priorMonthCount >= 1,
		}
	}, [transactions, now])

	const segmentSum = segments.reduce((sum, segment) => sum + segment.total, 0)

	let comparisonPill: { label: string; positive: boolean } | null = null
	if (showUsual && usual > 0 && txReady) {
		const percent = Math.round((Math.abs(spentNow - usual) / usual) * 100)
		const under = spentNow <= usual
		comparisonPill = {
			label: under ? `${percent}% under` : `${percent}% over`,
			positive: under,
		}
	}

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardTitle>{monthLabel} so far</CardTitle>
				<CardDescription className="text-xs">
					vs. your usual
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-sm text-muted-foreground">
						Spent{" "}
						<span className="font-semibold text-foreground tabular-nums">
							{txReady ? formatMoney(spentNow) : "—"}
						</span>
						{showUsual && txReady && (
							<>
								{" "}
								of a usual{" "}
								<span className="font-medium text-foreground tabular-nums">
									{formatMoney(usual)}
								</span>
							</>
						)}
					</p>
					{comparisonPill && (
						<span
							className={cn(
								"rounded-full px-2 py-0.5 text-xs font-medium",
								comparisonPill.positive
									? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
									: "bg-destructive/10 text-destructive"
							)}
						>
							{comparisonPill.label}
						</span>
					)}
				</div>
				{txReady && segmentSum > 0 && (
					<SpendBreakdown segments={segments} total={segmentSum} />
				)}
			</CardContent>
		</Card>
	)
}

/** Stacked category bar; hovering a slice (or its legend entry) shows that slice's breakdown. */
function SpendBreakdown({
	segments,
	total,
}: {
	segments: SpendSegment[]
	total: number
}) {
	const [activeKey, setActiveKey] = useState<string | null>(null)
	return (
		<>
			<div
				className="flex h-2.5 gap-0.5"
				onPointerLeave={() => setActiveKey(null)}
			>
				{segments.map((segment) => (
					<Tooltip
						key={segment.key}
						open={activeKey === segment.key}
						onOpenChange={(open) => {
							if (open) {
								setActiveKey(segment.key)
							} else if (activeKey === segment.key) {
								setActiveKey(null)
							}
						}}
					>
						<TooltipTrigger
							render={
								<button
									type="button"
									aria-label={`${segment.label}: ${formatMoney(segment.total)}`}
									className="h-full min-w-1 cursor-default rounded-full transition-opacity first:rounded-l-full last:rounded-r-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									style={{
										width: `${(segment.total / total) * 100}%`,
										background: segment.color,
										opacity:
											activeKey === null ||
											activeKey === segment.key
												? 1
												: 0.35,
									}}
									onPointerEnter={() =>
										setActiveKey(segment.key)
									}
									onFocus={() => setActiveKey(segment.key)}
									onBlur={() => setActiveKey(null)}
								/>
							}
						/>
						<TooltipContent className="block w-60 px-3 py-2.5">
							<SegmentDetails segment={segment} total={total} />
						</TooltipContent>
					</Tooltip>
				))}
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-1">
				{segments.map((segment) => (
					<span
						key={segment.key}
						className={cn(
							"inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity",
							activeKey !== null &&
								activeKey !== segment.key &&
								"opacity-50"
						)}
						onPointerEnter={() => setActiveKey(segment.key)}
						onPointerLeave={() => setActiveKey(null)}
					>
						<span
							className="size-2 rounded-full"
							style={{ background: segment.color }}
							aria-hidden
						/>
						{segment.label}
					</span>
				))}
			</div>
		</>
	)
}

/** Hover card body: total, share of the month, transaction count and top merchants. */
function SegmentDetails({
	segment,
	total,
}: {
	segment: SpendSegment
	total: number
}) {
	const share = Math.round((segment.total / total) * 100)
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<span
					className="size-2 rounded-full"
					style={{ background: segment.color }}
					aria-hidden
				/>
				<span className="font-medium">{segment.label}</span>
			</div>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-base font-semibold tabular-nums">
					{formatMoney(segment.total)}
				</span>
				<span className="text-muted-foreground">
					{share}% · {segment.count}{" "}
					{segment.count === 1 ? "purchase" : "purchases"}
				</span>
			</div>
			{segment.merchants.length > 0 && (
				<div className="flex flex-col gap-1 border-t border-border pt-2">
					{segment.merchants.map((row) => (
						<div
							key={row.merchant}
							className="flex justify-between gap-3"
						>
							<span className="truncate text-muted-foreground">
								{row.merchant}
							</span>
							<span className="tabular-nums">
								{formatMoney(row.total)}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
