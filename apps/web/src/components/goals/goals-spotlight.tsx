import { ReservedSlot } from "@/components/common/reserved-slot"
import { PlusIcon } from "@/components/icons/plus"
import { ArrowRightIcon } from "@/components/icons/arrow-right"
import { Money } from "@/components/common/money"

import { useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import {
	GoalBar,
	GoalIcon,
	GoalNudge,
	GoalStatusPill,
} from "@/components/goals/goal-bits"
import type { PaymentDraft } from "@/components/goals/goal-form"
import { GoalPaymentDialog } from "@/components/goals/goal-payment-dialog"
import { compareOpenGoals } from "@/components/goals/goal-sort"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { formatMoney } from "@/lib/format"
import { useConverter } from "@/lib/currency"
import { useGoals } from "@/lib/queries"
import { cn } from "cn"

/** The dashboard's goals strip: open goals with one-tap payments. Renders nothing when there are none. */
export function GoalsSpotlight() {
	const { data } = useGoals()
	const [paying, setPaying] = useState<PaymentDraft | null>(null)
	const fx = useConverter()
	const open = useMemo(
		() =>
			(data?.goals ?? [])
				// Ones you can add money to: yours, or shared with you for editing.
				.filter(
					(goal) =>
						!goal.archived &&
						goal.status !== "done" &&
						goal.access !== "view"
				)
				.toSorted(compareOpenGoals),
		[data]
	)
	if (open.length === 0) {
		return (
			<ReservedSlot id="goals" ready={data !== null}>
				{null}
			</ReservedSlot>
		)
	}

	const shown = open.slice(0, 3)
	const saved = fx.sum(open.map((goal) => [goal.saved, goal.currency]))
	const target = fx.sum(open.map((goal) => [goal.target, goal.currency]))
	const left = fx.sum(open.map((goal) => [goal.remaining, goal.currency]))

	return (
		<ReservedSlot id="goals" ready>
			<section
				aria-label="Your goals"
				className="rounded-xl border bg-card p-4 sm:p-5"
			>
				<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-baseline gap-2">
						<h2 className="font-semibold">Your Goals</h2>
						<span className="text-sm text-muted-foreground tabular-nums">
							{formatMoney(saved)} of {formatMoney(target)} ·{" "}
							{formatMoney(left)} left
						</span>
					</div>
					<Link
						to="/goals"
						className={cn(
							buttonVariants({ variant: "ghost", size: "sm" }),
							"-mr-2 text-muted-foreground"
						)}
					>
						{open.length > shown.length
							? `All ${open.length} goals`
							: "View goals"}{" "}
						<ArrowRightIcon size={24} className="flex" />
					</Link>
				</div>

				<div
					className={cn(
						"grid gap-3",
						shown.length > 1 && "md:grid-cols-2",
						shown.length > 2 && "lg:grid-cols-3"
					)}
				>
					{shown.map((goal) => (
						<div
							key={goal.id}
							className="flex flex-col gap-2.5 rounded-lg bg-muted/40 p-3"
						>
							<div className="flex items-center gap-3">
								<GoalIcon goal={goal} className="size-9" />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="truncate text-sm font-medium">
											{goal.name}
										</span>
										<GoalStatusPill status={goal.status} />
									</div>
									<p className="text-sm tabular-nums">
										<span className="font-semibold">
											<Money
												value={goal.saved}
												currency={goal.currency}
											/>
										</span>
										<span className="text-muted-foreground">
											{" "}
											/{" "}
											<Money
												value={goal.target}
												currency={goal.currency}
											/>
										</span>
										<span className="text-muted-foreground">
											{" "}
											·{" "}
											<Money
												value={goal.remaining}
												currency={goal.currency}
											/>{" "}
											left
										</span>
									</p>
								</div>
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label={`Add to ${goal.name}`}
									onClick={() => setPaying({ goal: goal })}
								>
									<PlusIcon size={24} className="flex" />
								</Button>
							</div>
							<GoalBar goal={goal} className="h-1.5" />
							<p className="truncate text-xs text-muted-foreground">
								<GoalNudge goal={goal} />
							</p>
						</div>
					))}
				</div>
				<GoalPaymentDialog
					draft={paying}
					onClose={() => setPaying(null)}
				/>
			</section>
		</ReservedSlot>
	)
}
