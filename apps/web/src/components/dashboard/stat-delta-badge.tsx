import { cn } from "cn"
import { Minus, TrendingDown, TrendingUp } from "lucide-react"

/** Percent change shown next to a headline figure, with whether up is good news. */
export type DashboardStatDelta = {
	percent: number
	label: string
	goodWhenUp: boolean
}

function formatDeltaPercent(percent: number) {
	const magnitude = Math.abs(percent)
	if (magnitude > 999) {
		return ">999%"
	}
	return `${Math.round(magnitude)}%`
}

/** Percent-change pill for headline figures such as net worth. */
export function StatDeltaBadge({ delta }: { delta: DashboardStatDelta }) {
	const { percent, label, goodWhenUp } = delta
	const up = percent > 0
	const flat = percent === 0
	let positiveTrend: boolean
	if (flat) {
		positiveTrend = true
	} else if (up) {
		positiveTrend = goodWhenUp
	} else {
		positiveTrend = !goodWhenUp
	}

	const Icon = flat ? Minus : up ? TrendingUp : TrendingDown

	return (
		<div className="flex flex-wrap items-center gap-1.5 pt-1">
			<span
				className={cn(
					"inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
					positiveTrend
						? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
						: "bg-destructive/10 text-destructive"
				)}
			>
				<Icon className="size-3 shrink-0" aria-hidden />
				{formatDeltaPercent(percent)}
			</span>
			<span className="text-[11px] text-muted-foreground">{label}</span>
		</div>
	)
}
