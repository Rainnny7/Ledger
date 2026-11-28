import {
	type ReactNode,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react"
import uPlot from "uplot"
// oxlint-disable-next-line import/no-unassigned-import -- stylesheet side effect
import "uplot/dist/uPlot.min.css"
// oxlint-disable-next-line import/no-unassigned-import -- stylesheet side effect
import "@/components/common/uplot-chart.css"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

/** How long the series take to sweep in from the left on first render and on new data. */
const REVEAL_DURATION_MILLISECONDS = 800

/**
 * Plays a chart's entry animation by easing `progressRef` from 0 to 1 and repainting each frame;
 * the `drawAxes`/`draw` hooks turn the progress into a left-to-right sweep or an upward grow (see
 * `ChartReveal`), so axes, grid and labels stay put. Skipped (progress jumps to 1) when the user prefers reduced motion.
 */
function animateReveal(
	chart: uPlot,
	progressRef: { current: number },
	frameRef: { current: number | null }
) {
	if (frameRef.current != null) {
		cancelAnimationFrame(frameRef.current)
		frameRef.current = null
	}
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		progressRef.current = 1
		return
	}
	const startTime = performance.now()
	progressRef.current = 0
	const step = (now: number) => {
		const linear = Math.min(
			1,
			(now - startTime) / REVEAL_DURATION_MILLISECONDS
		)
		// Cubic ease-out: fast start, gentle settle.
		progressRef.current = 1 - (1 - linear) ** 3
		chart.redraw(false, false)
		frameRef.current = linear < 1 ? requestAnimationFrame(step) : null
	}
	frameRef.current = requestAnimationFrame(step)
}

/** Colours and font a chart needs, read from the active theme's CSS variables. */
export type ChartTheme = {
	/** Money in / balance hue. */
	primary: string
	/** Money out hue. */
	secondary: string
	/** Hairline grid colour. */
	grid: string
	/** Muted tick-label colour. */
	label: string
	/** Card surface, used to ring hover markers. */
	surface: string
	/** Font stack of the app, so canvas text matches the page. */
	fontFamily: string
}

/** Everything `buildOptions` supplies; the wrapper owns size, hooks and legend. */
export type ChartOptions = Omit<
	uPlot.Options,
	"width" | "height" | "hooks" | "legend"
>

/** One line of the hover tooltip. */
export type TooltipRow = {
	/** Dot colour (any CSS colour); omit for an indented, dot-less note row. */
	color?: string
	label: string
	value: string
}

/** Content of the hover tooltip for one data index. */
export type TooltipContent = { title: string; rows: TooltipRow[] }

/**
 * How the series enter: "sweep" clips them in from left to right (suits lines and areas), "grow"
 * scales them up from the y = 0 baseline so bars rise from the bottom together.
 */
export type ChartReveal = "sweep" | "grow"

/** A legend entry rendered above the plot. */
export type LegendItem = { color: string; label: string }

/** Reads the chart palette from the CSS variables in effect on `element`. */
function readChartTheme(element: HTMLElement): ChartTheme {
	const styles = getComputedStyle(element)
	const probe = document.createElement("span")
	probe.style.display = "none"
	element.appendChild(probe)
	const readColor = (name: string) => {
		probe.style.color = `var(${name})`
		return getComputedStyle(probe).color
	}
	const theme = {
		primary: readColor("--chart-1"),
		secondary: readColor("--chart-2"),
		grid: readColor("--border"),
		label: readColor("--muted-foreground"),
		surface: readColor("--card"),
		fontFamily: styles.fontFamily,
	}
	probe.remove()
	return theme
}

/** Subscribes to theme switches, which next-themes performs by changing the class list on <html>. */
function subscribeToThemeClass(onChange: () => void) {
	const observer = new MutationObserver(onChange)
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "data-theme"],
	})
	return () => observer.disconnect()
}

const readThemeClass = () => document.documentElement.className

/** Changes value whenever the app theme changes, so canvas colours get re-read. */
function useThemeKey() {
	return useSyncExternalStore(subscribeToThemeClass, readThemeClass, () => "")
}

const MINIMUM_ZOOM_WIDTH = 6
const TOOLTIP_OFFSET = 14

/**
 * Thin React wrapper around uPlot. The chart is created once per `buildOptions`/theme change and
 * destroyed on unmount; new `data` goes through `setData`; a ResizeObserver keeps it fitted to its
 * box. It adds a cursor-following HTML tooltip, drag-to-zoom with a reset button, an optional
 * hover band (for bar charts) and an accessible text summary.
 *
 * `buildOptions` must be referentially stable (memoise it) because a new function rebuilds the chart.
 */
export function UPlotChart({
	buildOptions,
	data,
	renderTooltip,
	hover,
	reveal = "sweep",
	ariaLabel,
	legend,
	className,
}: {
	/** Builds the uPlot config from the current theme (axes, scales, series). */
	buildOptions: (theme: ChartTheme) => ChartOptions
	data: uPlot.AlignedData
	/** Tooltip content for a data index. */
	renderTooltip: (index: number) => TooltipContent
	/** "point" keeps the crosshair/markers the options configure; "band" shades the hovered slot. */
	hover: "point" | "band"
	/** Entry animation; defaults to a left-to-right sweep. */
	reveal?: ChartReveal
	/** Text summary read by screen readers in place of the canvas. */
	ariaLabel: string
	legend?: LegendItem[]
	/** Sizing classes for the whole chart box, e.g. `h-64`. */
	className?: string
}) {
	const themeKey = useThemeKey()
	const hostRef = useRef<HTMLDivElement>(null)
	const tooltipRef = useRef<HTMLDivElement>(null)
	const chartRef = useRef<uPlot | null>(null)
	const dataRef = useRef(data)
	// Share of the plot width (0..1) the series are drawn across; animated by animateReveal.
	const revealProgressRef = useRef(1)
	const revealFrameRef = useRef<number | null>(null)
	// The reveal plays on the first build only, not when a theme switch or resize rebuilds it.
	const hasRevealedRef = useRef(false)
	const [hoverIndex, setHoverIndex] = useState<number | null>(null)
	const [zoomed, setZoomed] = useState(false)
	const [trackedData, setTrackedData] = useState(data)
	if (trackedData !== data) {
		setTrackedData(data)
		setZoomed(false)
	}

	useEffect(() => {
		dataRef.current = data
	}, [data])

	// The chart itself: rebuilt only when its config or the theme changes.
	// themeKey is not read inside: a theme switch must rebuild the chart so it re-reads the CSS colours.
	useEffect(() => {
		const host = hostRef.current
		if (!host) {
			return
		}
		const options = buildOptions(readChartTheme(host))
		let bandElement: HTMLDivElement | null = null
		let lastIndex: number | null = null

		const showHover = (chart: uPlot) => {
			const index = chart.cursor.idx
			const active =
				index != null &&
				(chart.cursor.left ?? -1) >= 0 &&
				chart.select.width === 0
			const nextIndex = active ? index : null
			if (nextIndex !== lastIndex) {
				lastIndex = nextIndex
				setHoverIndex(nextIndex)
			}
			if (bandElement) {
				bandElement.style.display = active ? "block" : "none"
			}
			if (!active) {
				return
			}
			const positions = chart.data[0]
			const anchorX = chart.valToPos(positions[index], "x")
			if (bandElement) {
				const slot =
					positions.length > 1
						? Math.abs(
								chart.valToPos(positions[1], "x") -
									chart.valToPos(positions[0], "x")
							)
						: chart.bbox.width / uPlot.pxRatio
				bandElement.style.width = `${slot}px`
				bandElement.style.left = `${anchorX - slot / 2}px`
			}
			const tooltip = tooltipRef.current
			if (tooltip) {
				const originX = anchorX + chart.over.offsetLeft
				const flipped =
					originX + TOOLTIP_OFFSET + tooltip.offsetWidth >
					host.clientWidth
				const positionX = flipped
					? originX - TOOLTIP_OFFSET - tooltip.offsetWidth
					: originX + TOOLTIP_OFFSET
				const positionY = Math.max(
					0,
					Math.min(
						(chart.cursor.top ?? 0) +
							chart.over.offsetTop -
							tooltip.offsetHeight / 2,
						host.clientHeight - tooltip.offsetHeight
					)
				)
				tooltip.style.transform = `translate(${Math.max(0, positionX)}px, ${positionY}px)`
			}
		}

		const chart = new uPlot(
			{
				...options,
				width: host.clientWidth,
				height: host.clientHeight,
				legend: { show: false },
				cursor: {
					...options.cursor,
					drag: { x: true, y: false, setScale: false },
				},
				hooks: {
					// Series are drawn between these two hooks: limit them to the revealed share of the plot.
					drawAxes: [
						(drawing) => {
							drawing.ctx.save()
							if (revealProgressRef.current >= 1) {
								return
							}
							if (reveal === "grow") {
								// Squash vertically towards the zero line, in canvas pixels.
								const baseline = drawing.valToPos(0, "y", true)
								drawing.ctx.translate(0, baseline)
								drawing.ctx.scale(1, revealProgressRef.current)
								drawing.ctx.translate(0, -baseline)
							} else {
								drawing.ctx.beginPath()
								drawing.ctx.rect(
									0,
									0,
									drawing.bbox.left +
										drawing.bbox.width *
											revealProgressRef.current,
									drawing.ctx.canvas.height
								)
								drawing.ctx.clip()
							}
						},
					],
					draw: [(drawing) => drawing.ctx.restore()],
					setCursor: [showHover],
					setSelect: [
						(selecting) => {
							const { left, width } = selecting.select
							if (width < MINIMUM_ZOOM_WIDTH) {
								return
							}
							selecting.setSelect(
								{ left: 0, top: 0, width: 0, height: 0 },
								false
							)
							selecting.setScale("x", {
								min: selecting.posToVal(left, "x"),
								max: selecting.posToVal(left + width, "x"),
							})
							setZoomed(true)
						},
					],
				},
			},
			dataRef.current,
			host
		)
		chartRef.current = chart
		if (!hasRevealedRef.current) {
			hasRevealedRef.current = true
			animateReveal(chart, revealProgressRef, revealFrameRef)
		}
		if (hover === "band") {
			bandElement = document.createElement("div")
			bandElement.className = "u-hover-band"
			chart.over.appendChild(bandElement)
		}

		const observer = new ResizeObserver(() => {
			if (
				host.clientWidth !== chart.width ||
				host.clientHeight !== chart.height
			) {
				chart.setSize({
					width: host.clientWidth,
					height: host.clientHeight,
				})
			}
		})
		observer.observe(host)

		return () => {
			observer.disconnect()
			if (revealFrameRef.current != null) {
				cancelAnimationFrame(revealFrameRef.current)
				revealFrameRef.current = null
				revealProgressRef.current = 1
				// The reveal was cut short (e.g. StrictMode's mount-unmount-mount), so the next build replays it.
				hasRevealedRef.current = false
			}
			chart.destroy()
			chartRef.current = null
		}
		// oxlint-disable-next-line react/exhaustive-effect-dependencies
	}, [buildOptions, themeKey, hover, reveal])

	// New data goes through setData (which also resets zoom) instead of rebuilding.
	useEffect(() => {
		const chart = chartRef.current
		if (!chart || chart.data === data) {
			return
		}
		chart.setData(data)
		// A new range (e.g. a time-range switch) sweeps in like the first render.
		animateReveal(chart, revealProgressRef, revealFrameRef)
	}, [data])

	const resetZoom = () => {
		const chart = chartRef.current
		// Re-applying the data with resetScales re-derives the full x range (and auto y range) from it.
		// The scales can't be read back right after setData (uPlot commits them in a microtask).
		chart?.setData(dataRef.current, true)
		setZoomed(false)
	}

	const tooltip: TooltipContent | null =
		hoverIndex == null ? null : renderTooltip(hoverIndex)

	return (
		<div className={cn("flex h-56 w-full flex-col", className)}>
			{legend && (
				<ul className="mb-2 flex shrink-0 justify-end gap-4 text-xs text-muted-foreground">
					{legend.map((item) => (
						<li
							key={item.label}
							className="flex items-center gap-1.5"
						>
							<span
								className="size-2 rounded-full"
								style={{ background: item.color }}
							/>
							{item.label}
						</li>
					))}
				</ul>
			)}
			<div className="relative min-h-0 flex-1">
				<div
					ref={hostRef}
					role="img"
					aria-label={ariaLabel}
					className="ledger-chart absolute inset-0 select-none"
				/>
				{zoomed && (
					<Button
						type="button"
						variant="outline"
						size="xs"
						className="absolute top-0 right-0 z-10 bg-card shadow-md"
						onClick={resetZoom}
					>
						Reset zoom
					</Button>
				)}
				<div
					ref={tooltipRef}
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute top-0 left-0 z-20 min-w-40 rounded-lg border bg-popover/95 px-3 py-2 text-xs text-popover-foreground opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-100",
						tooltip && "opacity-100"
					)}
				>
					{tooltip && <TooltipBody content={tooltip} />}
				</div>
			</div>
		</div>
	)
}

/** Title plus one row per series, with coloured dots and tabular numbers. */
function TooltipBody({ content }: { content: TooltipContent }): ReactNode {
	return (
		<div className="grid gap-1.5">
			<div className="font-medium">{content.title}</div>
			{content.rows.map((row) => (
				<div key={row.label} className="flex items-center gap-2">
					<span
						className="size-2 shrink-0 rounded-full"
						style={{ background: row.color ?? "transparent" }}
					/>
					<span className="text-muted-foreground">{row.label}</span>
					<span className="ml-auto pl-4 font-mono font-medium tabular-nums">
						{row.value}
					</span>
				</div>
			))}
		</div>
	)
}
