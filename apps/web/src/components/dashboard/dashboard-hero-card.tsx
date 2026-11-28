import { AnimatedMoney } from "@/components/common/count-up"
import { BalanceChart } from "@/components/common/charts"
import { Hint } from "@/components/common/hint"
import { RangePicker } from "@/components/common/range-picker"
import { StatDeltaBadge } from "@/components/dashboard/stat-delta-badge"
import type { DashboardStatDelta } from "@/components/dashboard/stat-delta-badge"
import type { Account } from "@/lib/api"
import type { Converter } from "@/lib/currency"
import { inHomeCurrency } from "@/lib/currency"
import { formatMoney } from "@/lib/format"
import { type RangeKey, rangeLabel, rangeStart } from "@/lib/ranges"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Info } from "lucide-react"
import { cn } from "cn"

type SpendFigures = {
	now: number
	pending: number
	debt: number
	prev: number
}

/** Net-worth change from the first to last point in the selected balance series. */
function netWorthRangeDelta(
	series: { balance: number }[],
	range: RangeKey
): DashboardStatDelta | undefined {
	if (series.length < 2) {
		return undefined
	}
	const first = series[0].balance
	if (first === 0) {
		return undefined
	}
	const last = series[series.length - 1].balance
	const percent = ((last - first) / Math.abs(first)) * 100
	return {
		percent,
		label: `over ${rangeLabel(range)}`,
		goodWhenUp: true,
	}
}

/** Hero card: net worth, inline figures, balance chart and range picker. */
export function DashboardHeroCard({
	cad,
	home,
	converter,
	net,
	overdraftTotal,
	available,
	overdraftRoom,
	owing,
	spend,
	txReady,
	series,
	range,
	onRangeChange,
}: {
	cad: Account[]
	home: ReturnType<typeof inHomeCurrency>
	converter: Converter
	net: number
	overdraftTotal: number
	available: number
	overdraftRoom: number
	owing: number
	spend: SpendFigures
	txReady: boolean
	series: { date: string; balance: number }[]
	range: RangeKey
	onRangeChange: (range: RangeKey) => void
}) {
	const accountCountLabel = `${cad.length} account${cad.length === 1 ? "" : "s"}`
	let totalBalanceHint: string
	if (overdraftTotal > 0) {
		totalBalanceHint = `Includes ${formatMoney(overdraftTotal)} of overdraft · ${accountCountLabel}`
	} else {
		totalBalanceHint = `What you have minus what you owe, ${accountCountLabel}`
	}

	let totalBalanceNote: string | undefined
	if (home.skipped.length > 0) {
		totalBalanceNote = `Leaves out ${home.skipped.join(", ")} accounts (no exchange rate yet)`
	} else if (home.mixed) {
		totalBalanceNote = `In ${converter.home}, other currencies at today’s rates`
	}

	const netWorthDetails = [totalBalanceHint, totalBalanceNote].filter(
		(text): text is string => Boolean(text)
	)

	const delta = netWorthRangeDelta(series, range)
	const rangeFrom = rangeStart(range)

	return (
		<Card className="gap-0 overflow-hidden py-0">
			<div className="grid gap-4 px-5 pt-4 pb-2 lg:grid-cols-[1fr_auto] lg:items-end">
				<div className="flex flex-col gap-1">
					<span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
						Net worth
						{netWorthDetails.length > 0 && (
							<Hint
								label={
									<div className="space-y-1">
										{netWorthDetails.map((detail) => (
											<p key={detail}>{detail}</p>
										))}
									</div>
								}
							>
								<button
									type="button"
									aria-label="About net worth"
									className="text-muted-foreground/70 transition-colors hover:text-foreground"
								>
									<Info className="size-3.5" aria-hidden />
								</button>
							</Hint>
						)}
					</span>
					<div className="flex flex-wrap items-center gap-3">
						<span
							className={cn(
								"text-[2rem] leading-none font-semibold tracking-tight tabular-nums sm:text-[2.125rem]",
								net < 0 && "text-destructive"
							)}
						>
							<AnimatedMoney value={net} />
						</span>
						{delta && txReady && <StatDeltaBadge delta={delta} />}
					</div>
				</div>
				<div className="flex flex-wrap gap-5 sm:gap-8">
					<InlineFigure
						label="Available to spend"
						value={available}
						hint={
							overdraftRoom > 0
								? `Includes ${formatMoney(overdraftRoom)} of overdraft room`
								: "Across chequing, savings & wallets"
						}
					/>
					<InlineFigure
						label="Owing"
						value={owing}
						hint="Credit, loans and overdraft in use"
					/>
					<InlineFigure
						label="Spent this month"
						value={txReady ? spend.now : null}
						hint={[
							"Excludes transfers & income",
							spend.pending > 0 &&
								`${formatMoney(spend.pending)} pending`,
							spend.debt > 0 &&
								`+ ${formatMoney(spend.debt)} loan payments`,
						]
							.filter(Boolean)
							.join(" · ")}
					/>
				</div>
			</div>
			<div className="px-2">
				{txReady ? (
					<BalanceChart
						data={series}
						from={rangeFrom}
						className="!h-[170px]"
					/>
				) : (
					<Skeleton className="mx-3 h-[170px] rounded-md" />
				)}
			</div>
			<div className="flex justify-center px-5 pb-4">
				<RangePicker
					value={range}
					onChange={onRangeChange}
					options={["30d", "90d", "6m", "1y"]}
				/>
			</div>
		</Card>
	)
}

function InlineFigure({
	label,
	value,
	hint,
}: {
	label: string
	value: number | null
	hint?: string
}) {
	return (
		<div className="flex min-w-[7.5rem] flex-col gap-0.5 border-l pl-5 first:border-l-0 first:pl-0">
			<span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
				{label}
				{hint && (
					<Hint label={hint}>
						<button
							type="button"
							aria-label={`About ${label}`}
							className="text-muted-foreground/70 transition-colors hover:text-foreground"
						>
							<Info className="size-3" aria-hidden />
						</button>
					</Hint>
				)}
			</span>
			<span
				className={cn(
					"text-lg font-semibold tabular-nums",
					value !== null && value < 0 && "text-destructive"
				)}
			>
				{value === null ? "—" : <AnimatedMoney value={value} />}
			</span>
		</div>
	)
}
