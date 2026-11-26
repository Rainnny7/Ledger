import { Plus, Target } from "lucide-react"
import { GoalIcon } from "@/components/goals/goal-bits"
import { GOAL_PRESETS } from "@/components/goals/goal-presets"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { GoalInput } from "@/lib/api"

/** Empty Goals. */
export function EmptyGoals({
	onPick,
}: {
	onPick: (preset?: Partial<GoalInput>) => void
}) {
	return (
		<Card className="items-center py-12 text-center">
			<CardContent className="flex flex-col items-center gap-5">
				<span className="grid size-14 place-items-center rounded-2xl bg-sunset text-primary-foreground shadow-sm">
					<Target className="size-7" />
				</span>
				<div>
					<h2 className="font-semibold">
						What are you working toward?
					</h2>
					<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
						Set a goal, log payments as you make them, and watch it
						fill up. Pick a starter or make your own.
					</p>
				</div>
				<div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
					{GOAL_PRESETS.map(({ blurb, ...p }) => (
						<button
							key={p.name}
							type="button"
							onClick={() => onPick(p)}
							className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted"
						>
							<GoalIcon
								goal={{ icon: p.icon!, color: p.color! }}
								className="size-9"
							/>
							<span className="min-w-0">
								<span className="block text-sm font-medium">
									{p.name}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{blurb}
								</span>
							</span>
						</button>
					))}
				</div>
				<Button onClick={() => onPick()}>
					<Plus /> Custom goal
				</Button>
			</CardContent>
		</Card>
	)
}
