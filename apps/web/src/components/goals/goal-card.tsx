import { WithContextMenu } from "@/components/layout/app-context-menu"
import { MoreHorizontal } from "lucide-react"
import { useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { GoalIcon, GoalStatusPill } from "@/components/goals/goal-bits"
import {
	goalCardMenuItems,
	type GoalCardActions,
} from "@/components/goals/goal-card-menu"
import { GoalCardPayments } from "@/components/goals/goal-card-payments"
import { GoalCardProgress } from "@/components/goals/goal-card-progress"
import { ShareBadge } from "@/components/sharing/share-bits"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api, type Goal } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { cn } from "cn"

/** Public export. */
export type { GoalCardActions }

/** Goal UI card. */
export function GoalCard({
	goal,
	...actions
}: { goal: Goal } & GoalCardActions) {
	const owner = goal.access === "owner"
	const canEdit = goal.access !== "view"
	const [showAll, setShowAll] = useState(false)
	const payments = showAll ? goal.payments : goal.payments.slice(0, 3)
	const done = goal.status === "done"
	const [focusParam] = useQueryState("focus", parseAsString.withDefault(""))
	const focused = focusParam.split(",").includes(goal.id)
	const menuItems = goalCardMenuItems(goal, actions, { done, canEdit, owner })

	async function removePayment(id: string) {
		try {
			await api.deleteGoalPayment(goal.id, id)
			toast.success("Payment removed")
		} catch (error) {
			toastError((error as Error).message)
		}
	}

	let descriptionPrefix: string
	if (goal.kind === "payoff") {
		descriptionPrefix = "Paying off"
	} else {
		descriptionPrefix = "Saving up"
	}

	return (
		<WithContextMenu menu={menuItems}>
			<Card
				className={cn("gap-0", focused && "ring-2 ring-primary/60")}
				data-focused={focused || undefined}
			>
				<CardHeader className="flex items-start gap-3">
					<GoalIcon goal={goal} />
					<div className="min-w-0 flex-1">
						<CardTitle className="flex items-center gap-2">
							<span className="truncate">{goal.name}</span>
							<GoalStatusPill status={goal.status} />
							<ShareBadge
								item={goal}
								onClick={() => actions.onShare(goal)}
							/>
						</CardTitle>
						<CardDescription className="truncate">
							{descriptionPrefix}
							{goal.targetDate
								? ` · by ${formatDate(goal.targetDate)}`
								: ""}
							{done && goal.completedAt
								? ` · done ${formatDate(goal.completedAt)}`
								: ""}
						</CardDescription>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={`${goal.name} options`}
								/>
							}
						>
							<MoreHorizontal />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{menuItems}
						</DropdownMenuContent>
					</DropdownMenu>
				</CardHeader>

				<CardContent className="grid gap-4 pt-4">
					<GoalCardProgress
						goal={goal}
						done={done}
						canEdit={canEdit}
						onPay={actions.onPay}
					/>

					<GoalCardPayments
						goal={goal}
						payments={payments}
						showAll={showAll}
						canRemove={owner}
						onToggleShowAll={() =>
							setShowAll((visible) => !visible)
						}
						onRemove={(id) => void removePayment(id)}
					/>
				</CardContent>
			</Card>
		</WithContextMenu>
	)
}
