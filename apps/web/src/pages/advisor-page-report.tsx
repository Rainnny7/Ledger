import { Lightbulb } from "lucide-react"
import { perYear } from "@/components/advisor/advisor-meta"
import { AdvisorStat } from "@/components/advisor/advisor-stat"
import { AdvisorTipsSection } from "@/components/advisor/advisor-tips-section"
import { HealthCard } from "@/components/advisor/health-card"
import type { useAdvice } from "@/components/advisor/use-advice"
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { formatMoney } from "@/lib/format"

type AdvisorPageReportProps = {
	report: ReturnType<typeof useAdvice>["report"]
	tips: ReturnType<typeof useAdvice>["tips"]
	hiddenCount: number
	hiddenTips: ReturnType<typeof useAdvice>["hiddenTips"]
	onDismiss: ReturnType<typeof useAdvice>["dismiss"]
	onRestore: ReturnType<typeof useAdvice>["restore"]
}

/** Advisor dashboard body: empty state, stats grid, and tips. */
export function AdvisorPageReport({
	report,
	tips,
	hiddenCount,
	hiddenTips,
	onDismiss,
	onRestore,
}: AdvisorPageReportProps) {
	if (!report) {
		return (
			<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
				<span className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
					<Lightbulb className="size-5" />
				</span>
				<h2 className="font-medium">Nothing to go on yet</h2>
				<p className="max-w-sm text-sm text-muted-foreground">
					Once a bank account is connected and a few weeks of
					transactions are in, tips show up here.
				</p>
			</div>
		)
	}

	const potential = tips.reduce(
		(total, tip) => total + (tip.kind === "win" ? 0 : (tip.yearly ?? 0)),
		0
	)
	const summary = report.summary

	return (
		<>
			<div className="grid gap-4 lg:grid-cols-3">
				{report.health ? (
					<HealthCard health={report.health} />
				) : (
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle>Money Health</CardTitle>
							<CardDescription>
								No income shows up yet, so there's no score. It
								appears once pay comes in.
							</CardDescription>
						</CardHeader>
					</Card>
				)}
				<div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
					<AdvisorStat
						label="You Could Keep"
						value={potential >= 1 ? `~${perYear(potential)}` : "—"}
						hint={
							potential >= 1
								? "If you acted on every tip below"
								: "No savings spotted right now"
						}
						accent={potential >= 1}
					/>
					<AdvisorStat
						label="Savings Rate"
						value={
							summary?.savingsRate == null
								? "—"
								: `${Math.round(summary.savingsRate * 100)}%`
						}
						hint={
							summary?.avgIncome
								? `Of ${formatMoney(summary.avgIncome)} a month coming in`
								: undefined
						}
					/>
					<AdvisorStat
						label="Cash Cushion"
						value={
							summary?.cushionMonths == null
								? "—"
								: `${summary.cushionMonths.toFixed(1)} mo`
						}
						hint="How long your cash would cover usual spending"
					/>
					<AdvisorStat
						label="Subscriptions"
						value={
							summary
								? `${formatMoney(Math.round(summary.subscriptionsYearly)).replace(/\.00$/, "")}/yr`
								: "—"
						}
						hint={
							summary
								? `About ${formatMoney(summary.subscriptionsYearly / 12)} a month`
								: undefined
						}
					/>
				</div>
			</div>

			<AdvisorTipsSection
				tips={tips}
				hiddenCount={hiddenCount}
				hiddenTips={hiddenTips}
				onDismiss={onDismiss}
				onRestore={onRestore}
			/>
		</>
	)
}
