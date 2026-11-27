import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Hint } from "@/components/common/hint"
import { Sparkline } from "@/components/common/sparkline"
import { cn } from "cn"
import { Info, Minus, TrendingDown, TrendingUp } from "lucide-react"
import type { ReactNode } from "react"

/** Percent change pill shown under the sparkline on dashboard stat cards. */
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

function StatDeltaBadge({ delta }: { delta: DashboardStatDelta }) {
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

/** Headline figure card for the dashboard, with an info tooltip (hint and note), sparkline, delta badge and negative styling. */
export function DashboardStat({
	label,
	value,
	negative,
	hint,
	note,
	series,
	delta,
	showSparkline,
}: {
	label: string
	value: ReactNode
	negative?: boolean
	hint?: string
	note?: string
	series?: number[]
	delta?: DashboardStatDelta
	/** When false, the sparkline is hidden until transactions are ready. */
	showSparkline?: boolean
}) {
	const details = [hint, note].filter((text): text is string => Boolean(text))
	return (
		<Card size="sm">
			<CardHeader>
				<CardDescription className="flex items-center gap-1.5">
					{label}
					{details.length > 0 && (
						<Hint
							label={
								<div className="space-y-1">
									{details.map((detail) => (
										<p key={detail}>{detail}</p>
									))}
								</div>
							}
						>
							<button
								type="button"
								aria-label={`About ${label}`}
								className="text-muted-foreground/70 transition-colors hover:text-foreground"
							>
								<Info className="size-3.5" aria-hidden />
							</button>
						</Hint>
					)}
				</CardDescription>
				<CardTitle
					className={`text-2xl! font-semibold tabular-nums ${negative ? "text-destructive" : ""}`}
				>
					{value}
				</CardTitle>
				{showSparkline !== false && series && series.length >= 2 && (
					<div className="-mx-1 mt-1">
						<Sparkline values={series} />
					</div>
				)}
				{delta && <StatDeltaBadge delta={delta} />}
			</CardHeader>
		</Card>
	)
}
