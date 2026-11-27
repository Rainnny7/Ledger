import { AskLedgerButton } from "@/components/chat/ask-ledger-button"
import { AnimatedMoney } from "@/components/common/count-up"
import { Money } from "@/components/common/money"
import { PlusIcon } from "@/components/icons/plus"
import { GoalBar, GoalNudge, GoalRing } from "@/components/goals/goal-bits"
import type { GoalCardActions } from "@/components/goals/goal-card-menu"
import { Button } from "@/components/ui/button"
import type { Goal } from "@/lib/api"
import { formatDate, formatMoney } from "@/lib/format"

/** Progress ring, bar, notes, and payment actions on a goal card. */
export function GoalCardProgress({
	goal,
	done,
	canEdit,
	onPay,
}: {
	goal: Goal
	done: boolean
	canEdit: boolean
	onPay: GoalCardActions["onPay"]
}) {
	return (
		<>
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
				{!done ? (
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
				) : null}
			</div>
			<GoalBar goal={goal} />

			{goal.notes ? (
				<p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground italic">
					“{goal.notes}”
				</p>
			) : null}

			<div className="flex flex-wrap items-center gap-2">
				{!done && !goal.archived && canEdit ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => onPay(goal)}
						className="w-fit"
					>
						<PlusIcon size={24} className="flex" />{" "}
						{goal.kind === "payoff" ? "Log a payment" : "Add money"}
					</Button>
				) : null}
				{!done ? (
					<AskLedgerButton
						variant="tip"
						label="How Can I Reach This Sooner?"
						prompt={`How can I reach my goal “${goal.name}” sooner? Target ${formatMoney(goal.target, goal.currency)}, saved so far ${formatMoney(goal.saved, goal.currency)}, remaining ${formatMoney(goal.remaining, goal.currency)}${goal.targetDate ? `, deadline ${formatDate(goal.targetDate)}` : ""}. Suggest realistic steps using my spending and subscriptions.`}
					/>
				) : null}
			</div>
		</>
	)
}
