import { useMemo } from "react"
import { Link } from "@tanstack/react-router"
import { GoalBar } from "@/components/goals/goal-bits"
import { compareOpenGoals } from "@/components/goals/goal-sort"
import { perYear } from "@/components/advisor/advisor-meta"
import { useAdvice } from "@/components/advisor/use-advice"
import { Money } from "@/components/common/money"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useGoals } from "@/lib/queries"

/** Top open goals and a single Advisor savings line. Hidden when there is nothing to show. */
export function DashboardProgressCard() {
	const { data: goalsData } = useGoals()
	const { tips, loading: tipsLoading } = useAdvice()

	const openGoals = useMemo(
		() =>
			(goalsData?.goals ?? [])
				.filter(
					(goal) =>
						!goal.archived &&
						goal.status !== "done" &&
						goal.access !== "view"
				)
				.toSorted(compareOpenGoals)
				.slice(0, 2),
		[goalsData]
	)

	const actionable = useMemo(
		() => tips.filter((tip) => tip.kind !== "win"),
		[tips]
	)
	const yearlySavings = actionable.reduce(
		(total, tip) => total + (tip.yearly ?? 0),
		0
	)

	if (openGoals.length === 0 && actionable.length === 0 && !tipsLoading) {
		return null
	}
	if (
		openGoals.length === 0 &&
		actionable.length === 0 &&
		goalsData === null
	) {
		return null
	}

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardTitle>Progress</CardTitle>
				<Link
					to="/goals"
					className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
				>
					Goals &amp; Advisor
				</Link>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{openGoals.map((goal) => (
					<div key={goal.id} className="flex flex-col gap-1.5">
						<div className="flex items-baseline justify-between gap-2 text-sm">
							<span className="truncate font-medium">
								{goal.name}
							</span>
							<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
								<Money
									value={goal.saved}
									currency={goal.currency}
								/>{" "}
								/{" "}
								<Money
									value={goal.target}
									currency={goal.currency}
								/>
							</span>
						</div>
						<GoalBar goal={goal} className="h-1.5" />
					</div>
				))}
				{actionable.length > 0 && yearlySavings >= 20 && (
					<Link
						to="/advisor"
						className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm transition-colors hover:bg-primary/15"
					>
						<span>
							💡 {actionable.length} idea
							{actionable.length === 1 ? "" : "s"} could save you{" "}
							<b className="font-semibold tabular-nums">
								{perYear(yearlySavings)}
							</b>
						</span>
						<span className="shrink-0 font-medium text-primary">
							Advisor →
						</span>
					</Link>
				)}
				{actionable.length > 0 && yearlySavings < 20 && (
					<Link
						to="/advisor"
						className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm transition-colors hover:bg-primary/15"
					>
						<span>
							💡 {actionable.length} idea
							{actionable.length === 1 ? "" : "s"} in Advisor
						</span>
						<span className="shrink-0 font-medium text-primary">
							See →
						</span>
					</Link>
				)}
			</CardContent>
		</Card>
	)
}
