import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import type { Health } from "@/lib/advisor"
import { cn } from "cn"

const TONE: Record<Health["label"], string> = {
	Excellent: "text-emerald-600 dark:text-emerald-400",
	Good: "text-emerald-600 dark:text-emerald-400",
	Fair: "text-amber-600 dark:text-amber-400",
	"Needs Attention": "text-rose-600 dark:text-rose-400",
}

/** The 0–100 money health score as a ring. */
function ScoreRing({ health }: { health: Health }) {
	const radius = 52
	const circumference = 2 * Math.PI * radius
	return (
		<div className={cn("relative size-36 shrink-0", TONE[health.label])}>
			<svg
				viewBox="0 0 120 120"
				className="size-full -rotate-90"
				aria-hidden
			>
				<circle
					cx="60"
					cy="60"
					r={radius}
					fill="none"
					strokeWidth="10"
					className="stroke-muted"
				/>
				<circle
					cx="60"
					cy="60"
					r={radius}
					fill="none"
					strokeWidth="10"
					strokeLinecap="round"
					stroke="currentColor"
					strokeDasharray={circumference}
					strokeDashoffset={circumference * (1 - health.score / 100)}
					className="transition-[stroke-dashoffset] duration-700 ease-out"
				/>
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center">
				<span className="text-3xl font-semibold text-foreground tabular-nums">
					{health.score}
				</span>
				<span className="text-xs font-medium">{health.label}</span>
			</div>
		</div>
	)
}

/** Financial health score ring with its contributing factors. */
export function HealthCard({ health }: { health: Health }) {
	return (
		<Card className="lg:col-span-2">
			<CardHeader>
				<CardTitle>Money Health</CardTitle>
				<CardDescription>
					A score out of 100 from how you've done over the last few
					months.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
				<ScoreRing health={health} />
				<ul className="grid w-full gap-3">
					{health.factors.map((factor) => {
						const pct = factor.max ? factor.score / factor.max : 0
						return (
							<li key={factor.key} className="grid gap-1">
								<div className="flex items-baseline justify-between gap-2 text-sm">
									<span className="font-medium">
										{factor.label}
									</span>
									<span className="text-muted-foreground tabular-nums">
										{Math.round(factor.score)}/{factor.max}
									</span>
								</div>
								<div className="h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										className={cn(
											"h-full rounded-full transition-[width] duration-700",
											pct >= 0.7
												? "bg-emerald-500"
												: pct >= 0.4
													? "bg-amber-500"
													: "bg-rose-500"
										)}
										style={{
											width: `${Math.max(3, pct * 100)}%`,
										}}
									/>
								</div>
								<p className="text-xs text-muted-foreground">
									{factor.detail}
								</p>
							</li>
						)
					})}
				</ul>
			</CardContent>
		</Card>
	)
}
