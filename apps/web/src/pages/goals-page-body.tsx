import { ChevronDown, Trophy, Users } from "lucide-react"
import { PlusIcon } from "@/components/icons/plus"
import { AnimatedMoney } from "@/components/common/count-up"
import { GoalCard } from "@/components/goals/goal-card"
import { EmptyGoals } from "@/components/goals/empty-goals"
import { GoalStatCard } from "@/components/goals/goal-stat-card"
import type { useGoalsPage } from "@/components/goals/use-goals-page"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "cn"

type GoalsPageState = ReturnType<typeof useGoalsPage>

/** Goals page lists, stats, and section headings once data has loaded. */
export function GoalsPageBody({ page }: { page: GoalsPageState }) {
	if (page.goals.length === 0 && page.sharedOpen.length === 0) {
		return <EmptyGoals onPick={page.startNew} />
	}

	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<GoalStatCard
					label="Put Toward Goals"
					value={<AnimatedMoney value={page.saved} />}
					hint={`${page.open.length} goal${page.open.length === 1 ? "" : "s"} in progress`}
				/>
				<GoalStatCard
					label="Still to Go"
					value={<AnimatedMoney value={page.remaining} />}
				/>
				<GoalStatCard
					label="Needed per Month"
					value={
						page.perMonth > 0 ? (
							<AnimatedMoney value={page.perMonth} />
						) : (
							"—"
						)
					}
					hint="To hit every deadline"
				/>
				<GoalStatCard
					label="This Month"
					value={
						<AnimatedMoney
							value={page.thisMonth}
							sign={page.thisMonth !== 0}
						/>
					}
					hint="Payments logged so far"
				/>
			</div>

			{page.open.length > 0 ? (
				<div className="grid gap-4 md:grid-cols-2">
					{page.open.map((goal) => (
						<GoalCard key={goal.id} goal={goal} {...page.actions} />
					))}
				</div>
			) : (
				<Card className="items-center py-10 text-center">
					<CardContent className="flex flex-col items-center gap-3">
						<Trophy className="size-8 text-amber-500" />
						<p className="font-medium">
							Every goal reached. What’s next?
						</p>
						<Button size="sm" onClick={() => page.startNew()}>
							<PlusIcon size={24} className="flex" /> New goal
						</Button>
					</CardContent>
				</Card>
			)}

			{page.sharedOpen.length > 0 && (
				<section className="grid gap-3">
					<h2 className="flex items-center gap-2 text-sm font-semibold">
						<Users className="size-4 text-primary" /> Shared with
						you
					</h2>
					<div className="grid gap-4 md:grid-cols-2">
						{page.sharedOpen.map((goal) => (
							<GoalCard
								key={goal.id}
								goal={goal}
								{...page.actions}
							/>
						))}
					</div>
				</section>
			)}

			{page.reached.length > 0 && (
				<section className="grid gap-3">
					<h2 className="flex items-center gap-2 text-sm font-semibold">
						<Trophy className="size-4 text-amber-500" /> Reached
					</h2>
					<div className="grid gap-4 md:grid-cols-2">
						{page.reached.map((goal) => (
							<GoalCard
								key={goal.id}
								goal={goal}
								{...page.actions}
							/>
						))}
					</div>
				</section>
			)}

			{page.archived.length > 0 && (
				<section className="grid gap-3">
					<button
						type="button"
						className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
						onClick={() => page.setShowArchived((show) => !show)}
					>
						<ChevronDown
							className={cn(
								"size-4 transition-transform",
								!page.showArchived && "-rotate-90"
							)}
						/>
						Archived ({page.archived.length})
					</button>
					{page.showArchived && (
						<div className="grid animate-in gap-4 opacity-80 duration-200 fade-in-0 md:grid-cols-2">
							{page.archived.map((goal) => (
								<GoalCard
									key={goal.id}
									goal={goal}
									{...page.actions}
								/>
							))}
						</div>
					)}
				</section>
			)}
		</>
	)
}
