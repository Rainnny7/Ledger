import { useCallback, useMemo } from "react"
import uPlot from "uplot"
import {
	type ChartOptions,
	type ChartTheme,
	UPlotChart,
} from "@/components/common/uplot-chart"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Category } from "@/lib/api"
import { CATEGORY_META } from "@/lib/categories"
import {
	addDays,
	formatLongDate,
	formatMoney,
	formatMoneyCompact,
	getDisplayCurrency,
	formatMonth,
	formatShortDate,
	isoDate,
	parseIso,
} from "@/lib/format"
import { cn } from "cn"

const SECONDS_PER_DAY = 86_400
/** Day-based tick steps only, so date labels never repeat when zoomed in. */
const DAY_INCREMENTS = [1, 2, 7, 14, 30, 60, 91, 182, 365].map(
	(days) => days * SECONDS_PER_DAY
)
const Y_AXIS_WIDTH = 56
const PLOT_PADDING: [number, number, number, number] = [10, 14, 0, 0]

/** Shared axis look: no axis line, no ticks, muted labels in the app font, dashed horizontal grid only. */
function buildAxes(
	theme: ChartTheme,
	yFormat: (value: number) => string,
	xAxis: Partial<uPlot.Axis>
): uPlot.Axis[] {
	const font = `12px ${theme.fontFamily}`
	return [
		{
			stroke: theme.label,
			font,
			size: 30,
			gap: 4,
			grid: { show: false },
			ticks: { show: false },
			border: { show: false },
			...xAxis,
		},
		{
			stroke: theme.label,
			font,
			size: Y_AXIS_WIDTH,
			gap: 6,
			space: 44,
			grid: { stroke: theme.grid, width: 1, dash: [3, 5] },
			ticks: { show: false },
			border: { show: false },
			values: (_chart, splits) => splits.map(yFormat),
		},
	]
}

/** Vertical colour fade used under the balance line: strong at the line, transparent at the baseline. */
function buildAreaFill(color: string) {
	return (chart: uPlot) => {
		const gradient = chart.ctx.createLinearGradient(
			0,
			chart.bbox.top,
			0,
			chart.bbox.top + chart.bbox.height
		)
		gradient.addColorStop(
			0,
			`color-mix(in srgb, ${color} 34%, transparent)`
		)
		gradient.addColorStop(1, `color-mix(in srgb, ${color} 0%, transparent)`)
		return gradient
	}
}

/** "2026-11-24" → uPlot's epoch-seconds x value (local midnight). */
const dateToSeconds = (isoDay: string) => parseIso(isoDay).getTime() / 1000

/** Single-series balance over time: smooth line over a fading gradient, crosshair with a ringed marker. */
export function BalanceChart({
	data,
	currency = getDisplayCurrency(),
	className,
	from,
}: {
	data: { date: string; balance: number }[]
	currency?: string
	className?: string
	/** The range the user asked for; if history starts later, say so instead of silently showing less. */
	from?: string
}) {
	const chartData = useMemo<uPlot.AlignedData>(
		() => [
			data.map((point) => dateToSeconds(point.date)),
			data.map((point) => point.balance),
		],
		[data]
	)

	const buildOptions = useCallback(
		(theme: ChartTheme): ChartOptions => ({
			padding: PLOT_PADDING,
			scales: {
				x: { time: true },
				y: {
					range: (_chart, rawMin, rawMax) => {
						const dataMin = rawMin ?? 0
						const dataMax = rawMax ?? 0
						const [low, high] = uPlot.rangeNum(
							dataMin,
							dataMax,
							0.12,
							true
						)
						return [
							dataMin >= 0 ? Math.max(0, low ?? 0) : low,
							high,
						]
					},
				},
			},
			axes: buildAxes(
				theme,
				(value) => formatMoneyCompact(value, currency),
				{
					incrs: DAY_INCREMENTS,
					space: 72,
					values: (_chart, splits) =>
						splits.map((seconds) =>
							formatShortDate(isoDate(new Date(seconds * 1000)))
						),
				}
			),
			series: [
				{},
				{
					label: "Balance",
					stroke: theme.primary,
					width: 2,
					fill: buildAreaFill(theme.primary),
					paths: uPlot.paths.spline?.(),
					points: { show: false },
				},
			],
			cursor: {
				y: false,
				points: {
					size: 11,
					width: 2.5,
					stroke: () => theme.surface,
					fill: () => theme.primary,
				},
			},
		}),
		[currency]
	)

	const renderTooltip = useCallback(
		(index: number) => {
			const point = data[index]
			const previous = data[index - 1]
			return {
				title: formatLongDate(point.date),
				rows: [
					{
						color: "var(--chart-1)",
						label: "Balance",
						value: formatMoney(point.balance, currency),
					},
					...(previous
						? [
								{
									label: "Change",
									value: formatMoney(
										point.balance - previous.balance,
										currency,
										{ sign: true }
									),
								},
							]
						: []),
				],
			}
		},
		[data, currency]
	)

	if (data.length < 2) {
		return (
			<p className="py-16 text-center text-sm text-muted-foreground">
				Not enough history yet — refresh to pull more.
			</p>
		)
	}
	const balances = data.map((point) => point.balance)
	const first = data[0]
	const last = data[data.length - 1]
	const summary = `Balance from ${formatLongDate(first.date)} to ${formatLongDate(last.date)}: started at ${formatMoney(first.balance, currency)}, ended at ${formatMoney(last.balance, currency)}, lowest ${formatMoney(Math.min(...balances), currency)}, highest ${formatMoney(Math.max(...balances), currency)}.`
	const short = !!from && first.date > addDays(from, 3)
	return (
		<>
			<UPlotChart
				buildOptions={buildOptions}
				data={chartData}
				renderTooltip={renderTooltip}
				hover="point"
				ariaLabel={summary}
				className={className}
			/>
			{short && (
				<p className="mt-2 text-center text-xs text-muted-foreground">
					History synced back to {formatLongDate(first.date)} —
					refresh the bank connection to pull older transactions.
				</p>
			)}
		</>
	)
}

type FlowPoint = {
	month: string
	in: number
	out: number
	debt: number
	net: number
}

const BAR_RADIUS = 5
const BAR_GAP = 3
const MAX_BAR_WIDTH = 22
const GROUP_FILL = 0.62

/** "2026-11" → a whole-number slot (year * 12 + month) so every month is exactly one x unit wide. */
function monthToSlot(month: string) {
	const [year, monthNumber] = month.split("-").map(Number)
	return year * 12 + (monthNumber - 1)
}

/** Slot back to the "YYYY-MM" key the formatters expect. */
function slotToMonth(slot: number) {
	const year = Math.floor(slot / 12)
	return `${year}-${String(slot - year * 12 + 1).padStart(2, "0")}`
}

/**
 * Path builder for one bar in a side-by-side group: rounded top corners, flat on the baseline.
 * `order`/`count` place the bar inside its month slot.
 */
function groupedBars(order: number, count: number): uPlot.Series.PathBuilder {
	return (chart, seriesIndex, startIndex, endIndex) => {
		const pixelRatio = uPlot.pxRatio
		const positions = chart.data[0]
		const values = chart.data[seriesIndex]
		const slot = Math.abs(
			chart.valToPos(1, "x", true) - chart.valToPos(0, "x", true)
		)
		const gap = BAR_GAP * pixelRatio
		const barWidth = Math.min(
			(slot * GROUP_FILL - gap * (count - 1)) / count,
			MAX_BAR_WIDTH * pixelRatio
		)
		const groupWidth = barWidth * count + gap * (count - 1)
		const baseline = chart.valToPos(0, "y", true)
		const bars = new Path2D()
		for (let i = startIndex; i <= endIndex; i++) {
			const value = values[i]
			if (value == null || value <= 0) {
				continue
			}
			const top = chart.valToPos(value, "y", true)
			const height = baseline - top
			if (height < 1) {
				continue
			}
			const left =
				chart.valToPos(positions[i], "x", true) -
				groupWidth / 2 +
				order * (barWidth + gap)
			const radius = Math.min(
				BAR_RADIUS * pixelRatio,
				barWidth / 2,
				height
			)
			bars.roundRect(left, top, barWidth, height, [radius, radius, 0, 0])
		}
		const clip = new Path2D()
		clip.rect(
			chart.bbox.left,
			chart.bbox.top,
			chart.bbox.width,
			chart.bbox.height
		)
		return {
			fill: bars,
			stroke: bars,
			clip,
			flags: 0,
		} as uPlot.Series.Paths
	}
}

/** Grouped monthly columns: money in (net income) vs out (net spending + loan payments); transfers excluded. */
export function CashflowChart({
	data,
	className,
}: {
	data: FlowPoint[]
	className?: string
}) {
	const chartData = useMemo<uPlot.AlignedData>(
		() => [
			data.map((point) => monthToSlot(point.month)),
			data.map((point) => point.in),
			data.map((point) => point.out),
		],
		[data]
	)

	const buildOptions = useCallback(
		(theme: ChartTheme): ChartOptions => ({
			padding: PLOT_PADDING,
			scales: {
				x: {
					time: false,
					range: (_chart, dataMin, dataMax) => [
						dataMin - 0.5,
						dataMax + 0.5,
					],
				},
				y: {
					range: (_chart, _dataMin, dataMax) => [
						0,
						Math.max(dataMax, 1) * 1.1,
					],
				},
			},
			axes: buildAxes(theme, (value) => formatMoneyCompact(value), {
				incrs: [1, 2, 3, 4, 6, 12],
				space: 56,
				values: (_chart, splits) =>
					splits.map((slot) => {
						if (!Number.isInteger(slot)) {
							return null
						}
						const month = slotToMonth(slot)
						const label = formatMonth(month)
						return slot % 12 === 0
							? `${label} ’${month.slice(2, 4)}`
							: label
					}),
			}),
			series: [
				{},
				{
					label: "Money in",
					fill: theme.primary,
					stroke: theme.primary,
					width: 0,
					paths: groupedBars(0, 2),
					points: { show: false },
				},
				{
					label: "Money out",
					fill: theme.secondary,
					stroke: theme.secondary,
					width: 0,
					paths: groupedBars(1, 2),
					points: { show: false },
				},
			],
			cursor: { x: false, y: false, points: { show: false } },
		}),
		[]
	)

	const renderTooltip = useCallback(
		(index: number) => {
			const row = data[index]
			return {
				title: formatMonth(row.month, "long"),
				rows: [
					{
						color: "var(--chart-1)",
						label: "Money in",
						value: formatMoney(row.in),
					},
					{
						color: "var(--chart-2)",
						label: "Money out",
						value: formatMoney(row.out),
					},
					...(row.debt > 0
						? [
								{
									label: "incl. loan payments",
									value: formatMoney(row.debt),
								},
							]
						: []),
					{
						label: "Net",
						value: formatMoney(row.net, undefined, { sign: true }),
					},
				],
			}
		},
		[data]
	)

	if (data.length === 0) {
		return (
			<p className="py-16 text-center text-sm text-muted-foreground">
				No cash flow in this period yet.
			</p>
		)
	}
	const totalIn = data.reduce((sum, point) => sum + point.in, 0)
	const totalOut = data.reduce((sum, point) => sum + point.out, 0)
	const summary = `Monthly cash flow from ${formatMonth(data[0].month, "long")} to ${formatMonth(data[data.length - 1].month, "long")}: ${formatMoney(totalIn)} in and ${formatMoney(totalOut)} out in total.`
	return (
		<UPlotChart
			buildOptions={buildOptions}
			data={chartData}
			renderTooltip={renderTooltip}
			hover="band"
			ariaLabel={summary}
			className={className}
			legend={[
				{ color: "var(--chart-1)", label: "Money in" },
				{ color: "var(--chart-2)", label: "Money out" },
			]}
		/>
	)
}

/** Horizontal magnitude bars in one hue, direct-labelled, sorted largest first. */
export function CategoryBars({
	data,
	onSelect,
	selected,
}: {
	data: { category: Category; total: number; count: number }[]
	onSelect?: (category: Category) => void
	selected?: Category | null
}) {
	if (data.length === 0) {
		return (
			<p className="py-10 text-center text-sm text-muted-foreground">
				No spending in this period.
			</p>
		)
	}
	const max = data[0].total
	const sum = data.reduce(
		(runningTotal, entry) => runningTotal + entry.total,
		0
	)
	return (
		<ul className="grid gap-1">
			{data.map((entry) => {
				const { label, icon: Icon } = CATEGORY_META[entry.category]
				const pct = sum ? Math.round((entry.total / sum) * 100) : 0
				return (
					<li key={entry.category}>
						<Tooltip>
							<TooltipTrigger
								render={
									<button
										type="button"
										onClick={() =>
											onSelect?.(entry.category)
										}
										className={cn(
											"grid w-full grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60",
											selected === entry.category &&
												"bg-muted"
										)}
									/>
								}
							>
								<span className="flex min-w-0 items-center gap-2">
									<Icon className="size-4 shrink-0 text-muted-foreground" />
									<span className="truncate">{label}</span>
								</span>
								<span className="h-2.5 overflow-hidden rounded-full bg-muted">
									<span
										className="block h-full rounded-full bg-chart-1 transition-[width] duration-300"
										style={{
											width: `${Math.max(2, (entry.total / max) * 100)}%`,
										}}
									/>
								</span>
								<span className="w-20 text-right font-medium tabular-nums">
									{formatMoney(entry.total)}
								</span>
							</TooltipTrigger>
							<TooltipContent side="top">
								{label}: {formatMoney(entry.total)} · {pct}% of
								spending · {entry.count} transaction
								{entry.count === 1 ? "" : "s"}
							</TooltipContent>
						</Tooltip>
					</li>
				)
			})}
		</ul>
	)
}
