import { AskLedgerButton } from "@/components/chat/ask-ledger-button"
import { WithContextMenu } from "@/components/layout/app-context-menu"
import { PlusIcon } from "@/components/icons/plus"
import { AnimatedMoney } from "@/components/common/count-up"
import { Money } from "@/components/common/money"
import { MoreHorizontal } from "lucide-react"
import { useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import {
	GoalBar,
	GoalIcon,
	GoalNudge,
	GoalRing,
	GoalStatusPill,
} from "@/components/goals/goal-bits"
import {
	goalCardMenuItems,
	type GoalCardActions,
} from "@/components/goals/goal-card-menu"
import { GoalCardPayments } from "@/components/goals/goal-card-payments"
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
import { formatDate, formatMoney } from "@/lib/format"
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
							{goal.kind === "payoff"
								? "Paying off"
								: "Saving up"}
							{goal.targetDate &&
								` · by ${formatDate(goal.targetDate)}`}
							{done &&
								goal.completedAt &&
								` · done ${formatDate(goal.completedAt)}`}
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
					<div className="flex items-center gap-4">
						<GoalRing goal={goal} />
						<div className="min-w-0 flex-1">
							<p className="text-2xl font-semibold tabular-nums">
								<AnimatedMoney
									value={goal.saved}
									currency={goal.currency}
								/>
								<span className="text-sm font-normal text-muted-foreground">
									{" "}
									/{" "}
									<Money
										value={goal.target}
										currency={goal.currency}
									/>
								</span>
							</p>
							<p className="mt-0.5 text-sm text-muted-foreground">
								<GoalNudge goal={goal} />
							</p>
						</div>
						{!done && (
							<div className="shrink-0 text-right">
								<p className="text-lg font-semibold tabular-nums">
									<Money
										value={goal.remaining}
										currency={goal.currency}
									/>
								</p>
								<p className="text-xs text-muted-foreground">
									{goal.kind === "payoff"
										? "left to pay"
										: "left to save"}
								</p>
							</div>
						)}
					</div>
					<GoalBar goal={goal} />

					{goal.notes && (
						<p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground italic">
							“{goal.notes}”
						</p>
					)}

					<div className="flex flex-wrap items-center gap-2">
						{!done && !goal.archived && canEdit && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => actions.onPay(goal)}
								className="w-fit"
							>
								<PlusIcon size={24} className="flex" />{" "}
								{goal.kind === "payoff"
									? "Log a payment"
									: "Add money"}
							</Button>
						)}
						{!done && (
							<AskLedgerButton
								variant="tip"
								label="How Can I Reach This Sooner?"
								prompt={`How can I reach my goal “${goal.name}” sooner? Target ${formatMoney(goal.target, goal.currency)}, saved so far ${formatMoney(goal.saved, goal.currency)}, remaining ${formatMoney(goal.remaining, goal.currency)}${goal.targetDate ? `, deadline ${formatDate(goal.targetDate)}` : ""}. Suggest realistic steps using my spending and subscriptions.`}
							/>
						)}
					</div>

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
