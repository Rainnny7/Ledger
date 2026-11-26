import { Money } from "@/components/common/money"
import { PlusIcon } from "@/components/icons/plus"
import { CheckIcon } from "@/components/icons/check"
import { GoalIcon } from "@/components/goals/goal-bits"
import type { PaymentDraft } from "@/components/goals/goal-form"
import { Loader2, Repeat, Target, Unlink } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Goal, Subscription, Transaction } from "@/lib/api"
import { api } from "@/lib/api"
import { queryClient } from "@/lib/queries"
import { useState } from "react"

/** Save, subscription linking, and goal payment actions for the transaction sheet. */
export function TransactionSheetActions({
	transaction,
	openGoals,
	subs,
	countedFor,
	countedByHand,
	dirty,
	saving,
	onSave,
	onPayGoal,
	linked,
}: {
	transaction: Transaction
	openGoals: Goal[]
	subs: Subscription[]
	countedFor: Subscription | undefined
	countedByHand: boolean
	dirty: boolean
	saving: boolean
	onSave: () => void
	onPayGoal: (draft: PaymentDraft) => void
	linked: Goal[]
}) {
	const navigate = useNavigate()
	const [linking, setLinking] = useState(false)

	async function countToward(subscriptionId: string | null) {
		setLinking(true)
		try {
			await api.linkSubscriptionCharge(transaction.id, subscriptionId)
			await queryClient.invalidateQueries()
			const name = subs.find(
				(subscription) => subscription.id === subscriptionId
			)?.name
			toast.success(
				name
					? `Counted toward ${name}`
					: "No longer counted toward a subscription"
			)
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setLinking(false)
		}
	}

	function trackAsSubscription() {
		const params = new URLSearchParams({
			track: transaction.merchantKey,
			name: transaction.merchant,
			amount: String(Math.abs(transaction.amount)),
			date: transaction.date,
			account: transaction.accountId,
		})
		navigate({ href: `/subscriptions?${params}` })
	}

	return (
		<>
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={!dirty || saving}
					onClick={() => void onSave()}
				>
					{saving && <Loader2 className="animate-spin" />}
					Save changes
				</Button>
				{transaction.amount < 0 &&
					(subs.length === 0 ? (
						<Button variant="outline" onClick={trackAsSubscription}>
							<Repeat /> Track as subscription
						</Button>
					) : (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										variant="outline"
										disabled={linking}
									/>
								}
							>
								{linking ? (
									<Loader2 className="animate-spin" />
								) : (
									<Repeat />
								)}{" "}
								Subscription
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								className="max-h-80 min-w-60"
							>
								<DropdownMenuGroup>
									<DropdownMenuLabel>
										Count this charge toward…
									</DropdownMenuLabel>
									{subs.map((subscription) => (
										<DropdownMenuItem
											key={subscription.id}
											disabled={
												countedFor?.id ===
													subscription.id &&
												countedByHand
											}
											onClick={() =>
												void countToward(
													subscription.id
												)
											}
										>
											<CheckIcon
												size={24}
												className="flex"
											/>
											<span className="flex-1 truncate">
												{subscription.name}
											</span>
											<span className="text-xs text-muted-foreground tabular-nums">
												<Money
													value={subscription.amount}
													currency={
														subscription.currency
													}
												/>
											</span>
										</DropdownMenuItem>
									))}
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								{countedByHand && (
									<DropdownMenuItem
										onClick={() => void countToward(null)}
									>
										<Unlink /> Stop counting it
									</DropdownMenuItem>
								)}
								<DropdownMenuItem onClick={trackAsSubscription}>
									<PlusIcon size={24} className="flex" />{" "}
									Track as a new subscription
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					))}
				{openGoals.length > 0 && (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={<Button variant="outline" />}
						>
							<Target /> Add to goal
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="min-w-56">
							<DropdownMenuLabel>
								Count this toward…
							</DropdownMenuLabel>
							{openGoals.map((goal) => (
								<DropdownMenuItem
									key={goal.id}
									onClick={() =>
										onPayGoal({
											goal,
											amount: Math.abs(
												transaction.amount
											),
											date: transaction.date,
											note: transaction.merchant,
											transactionId: transaction.id,
										})
									}
								>
									<GoalIcon
										goal={goal}
										className="size-5 rounded-md"
									/>
									<span className="truncate">
										{goal.name}
									</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			{(linked.length > 0 || countedFor) && (
				<div className="-mt-2 grid gap-1 text-xs text-muted-foreground">
					{countedFor && (
						<p className="flex items-center gap-1.5">
							<Repeat className="size-3.5" /> A charge for{" "}
							{countedFor.name}
							{countedByHand ? " (counted by hand)" : ""}
						</p>
					)}
					{linked.length > 0 && (
						<p className="flex items-center gap-1.5">
							<Target className="size-3.5" /> Counted toward{" "}
							{linked.map((goal) => goal.name).join(", ")}
						</p>
					)}
				</div>
			)}
		</>
	)
}
