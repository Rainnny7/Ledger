import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	XAxis,
	YAxis,
} from "recharts"
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
} from "@/components/ui/chart-recharts"
import { Button } from "@/components/ui/button"
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
} from "@/lib/format"
import { cn } from "cn"

/** Tooltip card shared by the charts: label on top, then one row per series. Text stays in ink colours. */
function TipCard({
	title,
	rows,
}: {
	title: string
	rows: { color: string; name: string; value: string }[]
}) {
	return (
		<div className="grid min-w-36 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
			<div className="font-medium">{title}</div>
			{rows.map((row) => (
				<div key={row.name} className="flex items-center gap-2">
					<span
						className="size-2.5 shrink-0 rounded-[2px]"
						style={{ background: row.color }}
					/>
					<span className="text-muted-foreground">{row.name}</span>
					<span className="ml-auto pl-3 font-mono font-medium tabular-nums">
						{row.value}
					</span>
				</div>
			))}
		</div>
	)
}

type ChartDragState = {
	activeLabel?: string | number
	activeCoordinate?: { x?: number }
}

/**
 * Click-drag x selection: slices `data` by inclusive [start,end] on `xKey`; resets when `data` changes.
 * The selection box is moved straight in the DOM (no React state per mouse move) so dragging stays smooth.
 */
function useChartZoom<T extends Record<string, unknown>>(
	data: T[],
	xKey: keyof T & string
) {
	const dataEpoch = data.length
		? `${String(data[0][xKey])}|${String(data[data.length - 1][xKey])}|${data.length}`
		: ""
	const [zoom, setZoom] = useState<{ start: string; end: string } | null>(
		null
	)
	const frameRef = useRef<HTMLDivElement>(null)
	const overlayRef = useRef<HTMLDivElement>(null)
	const anchor = useRef<{ label: string; x: number } | null>(null)
	const last = useRef<string | null>(null)

	const endDrag = () => {
		anchor.current = null
		last.current = null
		delete frameRef.current?.dataset.selecting
		if (overlayRef.current) {
			overlayRef.current.style.display = "none"
		}
	}

	// oxlint-disable react/exhaustive-effect-dependencies -- reset zoom when dataEpoch changes
	useEffect(() => {
		// oxlint-disable-next-line react/set-state-in-effect -- reset zoom UI when chart data generation changes
		setZoom(null)
		endDrag()
	}, [dataEpoch])
	// oxlint-enable react/exhaustive-effect-dependencies

	const chartData = useMemo(() => {
		if (!zoom || !data.length) {
			return data
		}
		const i0 = data.findIndex((point) => String(point[xKey]) === zoom.start)
		const i1 = data.findIndex((point) => String(point[xKey]) === zoom.end)
		if (i0 < 0 || i1 < 0) {
			return data
		}
		const [startIndex, endIndex] = i0 <= i1 ? [i0, i1] : [i1, i0]
		return data.slice(startIndex, endIndex + 1)
	}, [data, zoom, xKey])

	const onMouseDown = (dragState: ChartDragState) => {
		const positionX = dragState.activeCoordinate?.x
		if (
			dragState.activeLabel == null ||
			positionX == null ||
			data.length < 2
		) {
			return
		}
		anchor.current = { label: String(dragState.activeLabel), x: positionX }
		last.current = anchor.current.label
		if (frameRef.current) {
			frameRef.current.dataset.selecting = "true"
		}
	}

	const onMouseMove = (dragState: ChartDragState) => {
		const from = anchor.current
		const overlay = overlayRef.current
		const positionX = dragState.activeCoordinate?.x
		if (
			!from ||
			!overlay ||
			dragState.activeLabel == null ||
			positionX == null
		) {
			return
		}
		const label = String(dragState.activeLabel)
		if (label === last.current) {
			return
		}
		last.current = label
		overlay.style.left = `${Math.min(from.x, positionX)}px`
		overlay.style.width = `${Math.abs(positionX - from.x)}px`
		overlay.style.display = "block"
	}

	const onMouseUp = () => {
		const from = anchor.current
		const to = last.current
		endDrag()
		if (!from || !to || from.label === to) {
			return
		}
		const iL = data.findIndex((point) => String(point[xKey]) === from.label)
		const iR = data.findIndex((point) => String(point[xKey]) === to)
		if (iL < 0 || iR < 0) {
			return
		}
		const [startIndex, endIndex] = iL <= iR ? [iL, iR] : [iR, iL]
		if (endIndex - startIndex + 1 < 2) {
			return
		}
		setZoom({
			start: String(data[startIndex][xKey]),
			end: String(data[endIndex][xKey]),
		})
	}

	return {
		data: chartData,
		zoomed: zoom != null,
		resetZoom: () => setZoom(null),
		frameRef,
		overlayRef,
		handlers: {
			onMouseDown,
			onMouseMove,
			onMouseUp,
			onMouseLeave: endDrag,
		},
	}
}

/** Positioning wrapper for a zoomable chart: reset button, selection box, and no tooltip while dragging. */
function ChartZoomFrame({
	zoom,
	children,
}: {
	zoom: ReturnType<typeof useChartZoom>
	children: ReactNode
}) {
	return (
		<div
			ref={zoom.frameRef}
			className="relative data-[selecting]:[&_.recharts-tooltip-wrapper]:!invisible"
		>
			<ChartZoomReset zoomed={zoom.zoomed} onReset={zoom.resetZoom} />
			<div
				ref={zoom.overlayRef}
				style={{ display: "none" }}
				className="pointer-events-none absolute top-2 bottom-8 z-10 rounded-sm bg-chart-1/15"
			/>
			{children}
		</div>
	)
}

function ChartZoomReset({
	zoomed,
	onReset,
}: {
	zoomed: boolean
	onReset: () => void
}) {
	if (!zoomed) {
		return null
	}
	return (
		<Button
			type="button"
			variant="ghost"
			size="xs"
			className="absolute top-0 right-0 z-10"
			onClick={onReset}
		>
			Reset zoom
		</Button>
	)
}

const balanceConfig = {
	balance: { label: "Balance", color: "var(--chart-1)" },
} satisfies ChartConfig

/** Single-series balance over time: 2px line, faint fill, hairline grid. */
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
	const zoom = useChartZoom(data, "date")
	if (data.length < 2) {
		return (
			<p className="py-16 text-center text-sm text-muted-foreground">
				Not enough history yet — refresh to pull more.
			</p>
		)
	}
	const min = Math.min(...zoom.data.map((point) => point.balance))
	const short = !!from && data[0].date > addDays(from, 3)
	return (
		<>
			<ChartZoomFrame zoom={zoom}>
				<ChartContainer
					config={balanceConfig}
					className={cn(
						"aspect-auto h-56 w-full select-none",
						className
					)}
				>
					<AreaChart
						data={zoom.data}
						margin={{ left: 4, right: 8, top: 8 }}
						{...zoom.handlers}
					>
						<defs>
							<linearGradient
								id="fill-balance"
								x1="0"
								y1="0"
								x2="0"
								y2="1"
							>
								<stop
									offset="0%"
									stopColor="var(--color-balance)"
									stopOpacity={0.16}
								/>
								<stop
									offset="100%"
									stopColor="var(--color-balance)"
									stopOpacity={0.02}
								/>
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} strokeDasharray="0" />
						<XAxis
							dataKey="date"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							minTickGap={40}
							tickFormatter={(dateLabel: string) =>
								formatShortDate(dateLabel)
							}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							width={52}
							tickFormatter={(amount: number) =>
								formatMoneyCompact(amount, currency)
							}
							domain={[min < 0 ? "auto" : 0, "auto"]}
						/>
						<ChartTooltip
							cursor={{ strokeWidth: 1 }}
							// oxlint-disable-next-line react/no-unstable-nested-components -- recharts tooltip renderer
							content={({ active, payload }) =>
								active && payload?.length ? (
									<TipCard
										title={formatLongDate(
											String(payload[0].payload.date)
										)}
										rows={[
											{
												color: "var(--color-balance)",
												name: "Balance",
												value: formatMoney(
													Number(payload[0].value),
													currency
												),
											},
										]}
									/>
								) : null
							}
						/>
						<Area
							dataKey="balance"
							type="monotone"
							stroke="var(--color-balance)"
							strokeWidth={2}
							fill="url(#fill-balance)"
							activeDot={{
								r: 4,
								strokeWidth: 2,
								stroke: "var(--background)",
							}}
							isAnimationActive={false}
						/>
					</AreaChart>
				</ChartContainer>
			</ChartZoomFrame>
			{short && (
				<p className="mt-2 text-center text-xs text-muted-foreground">
					History synced back to {formatLongDate(data[0].date)} —
					refresh the bank connection to pull older transactions.
				</p>
			)}
		</>
	)
}

const flowConfig = {
	in: { label: "Money in", color: "var(--chart-1)" },
	out: { label: "Money out", color: "var(--chart-2)" },
} satisfies ChartConfig

/** Grouped monthly columns: money in (net income) vs out (net spending + loan payments); transfers excluded. */
export function CashflowChart({
	data,
	className,
}: {
	data: {
		month: string
		in: number
		out: number
		debt: number
		net: number
	}[]
	className?: string
}) {
	const zoom = useChartZoom(data, "month")
	const flowMax = Math.max(
		0,
		...zoom.data.flatMap((point) => [point.in, point.out])
	)
	return (
		<ChartZoomFrame zoom={zoom}>
			<ChartContainer
				config={flowConfig}
				className={cn("aspect-auto h-56 w-full select-none", className)}
			>
				<BarChart
					data={zoom.data}
					margin={{ left: 4, right: 8, top: 8 }}
					barGap={2}
					barCategoryGap="25%"
					{...zoom.handlers}
				>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="month"
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						tickFormatter={(month: string) => formatMonth(month)}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={52}
						tickFormatter={(amount: number) =>
							formatMoneyCompact(amount)
						}
						domain={[0, flowMax || "auto"]}
					/>
					<ChartTooltip
						cursor={{ fillOpacity: 0.5 }}
						// oxlint-disable-next-line react/no-unstable-nested-components -- recharts tooltip renderer
						content={({ active, payload }) => {
							if (!active || !payload?.length) {
								return null
							}
							const row = payload[0].payload as {
								month: string
								in: number
								out: number
								debt: number
								net: number
							}
							return (
								<TipCard
									title={formatMonth(row.month, "long")}
									rows={[
										{
											color: "var(--color-in)",
											name: "Money in",
											value: formatMoney(row.in),
										},
										{
											color: "var(--color-out)",
											name: "Money out",
											value: formatMoney(row.out),
										},
										...(row.debt > 0
											? [
													{
														color: "transparent",
														name: "  incl. loan payments",
														value: formatMoney(
															row.debt
														),
													},
												]
											: []),
										{
											color: "transparent",
											name: "Net",
											value: formatMoney(
												row.net,
												undefined,
												{ sign: true }
											),
										},
									]}
								/>
							)
						}}
					/>
					<ChartLegend content={<ChartLegendContent />} />
					<Bar
						dataKey="in"
						fill="var(--color-in)"
						radius={[4, 4, 0, 0]}
						maxBarSize={22}
						isAnimationActive={false}
					/>
					<Bar
						dataKey="out"
						fill="var(--color-out)"
						radius={[4, 4, 0, 0]}
						maxBarSize={22}
						isAnimationActive={false}
					/>
				</BarChart>
			</ChartContainer>
		</ChartZoomFrame>
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
								<span className="h-3 overflow-hidden rounded-r-[4px]">
									<span
										className="block h-full rounded-r-[4px] bg-chart-1"
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
