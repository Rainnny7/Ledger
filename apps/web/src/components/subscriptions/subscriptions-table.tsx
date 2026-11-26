import { WithContextMenu } from "@/components/layout/app-context-menu"
import { Trash2Icon } from "@/components/icons/trash-2"
import { PencilIcon } from "@/components/icons/pencil"
import { Share2Icon } from "@/components/icons/share-2"
import { confirmDialog } from "@/lib/confirm"
import { Money } from "@/components/common/money"
import { LogOut, MoreHorizontal, Pause, Play } from "lucide-react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { subscriptionDueLabel } from "@/components/subscriptions/subscription-utils"
import { CategoryIcon } from "@/components/transactions/tx-bits"
import { Badge } from "@/components/ui/badge"
import { ShareBadge } from "@/components/sharing/share-bits"
import { leaveShared } from "@/lib/sharing"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { api, type Account, type Subscription } from "@/lib/api"
import { cycleLabel } from "@/lib/cycles"
import { formatLongDate, formatMoney, formatRelativeDate } from "@/lib/format"
import { cn } from "cn"

async function toggleSubscription(subscription: Subscription) {
	try {
		await api.updateSubscription(subscription.id, {
			active: !subscription.active,
		})
		toast.success(
			subscription.active
				? `${subscription.name} paused`
				: `${subscription.name} resumed`
		)
	} catch (error) {
		toastError((error as Error).message)
	}
}

async function removeSubscription(subscription: Subscription) {
	if (
		!(await confirmDialog({
			title: `Stop tracking ${subscription.name}?`,
			description:
				"It’subscription removed from your subscriptions. Your transactions aren’t affected.",
			action: "Stop tracking",
			destructive: true,
		}))
	) {
		return
	}
	try {
		await api.deleteSubscription(subscription.id)
		toast.success(`${subscription.name} removed`)
	} catch (error) {
		toastError((error as Error).message)
	}
}

/** Table of tracked subscriptions with per-row edit, share, pause and remove actions. */
export function SubscriptionsTable({
	sorted,
	accounts,
	focus,
	loading,
	onEdit,
	onShare,
}: {
	sorted: Subscription[]
	accounts: Account[]
	focus: Set<string>
	loading: boolean
	onEdit: (subscription: Subscription) => void
	onShare: (subscription: Subscription) => void
}) {
	if (loading) {
		return null
	}

	if (sorted.length === 0) {
		return null
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="pl-4">Name</TableHead>
					<TableHead className="hidden sm:table-cell">
						Next payment
					</TableHead>
					<TableHead className="hidden md:table-cell">
						Last charged
					</TableHead>
					<TableHead className="text-right">Amount</TableHead>
					<TableHead className="hidden text-right lg:table-cell">
						Per month
					</TableHead>
					<TableHead className="w-12 pr-4">
						<span className="sr-only">Actions</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{sorted.map((subscription) => {
					const account = accounts.find(
						(linkedAccount) =>
							linkedAccount.id === subscription.accountId
					)
					const changed =
						subscription.lastCharge &&
						Math.abs(
							Math.abs(subscription.lastCharge.amount) -
								subscription.amount
						) >= 0.01
					const menuItems = (
						<>
							{subscription.access !== "view" && (
								<>
									<DropdownMenuItem
										onClick={() => onEdit(subscription)}
									>
										<PencilIcon
											size={24}
											className="flex"
										/>{" "}
										Edit
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() =>
											void toggleSubscription(
												subscription
											)
										}
									>
										{subscription.active ? (
											<Pause />
										) : (
											<Play />
										)}{" "}
										{subscription.active
											? "Pause"
											: "Resume"}
									</DropdownMenuItem>
								</>
							)}
							{subscription.access === "owner" ? (
								<>
									<DropdownMenuItem
										onClick={() => onShare(subscription)}
									>
										<Share2Icon
											size={24}
											className="flex"
										/>{" "}
										Share
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										variant="destructive"
										onClick={() =>
											void removeSubscription(
												subscription
											)
										}
									>
										<Trash2Icon
											size={24}
											className="flex"
										/>{" "}
										Delete
									</DropdownMenuItem>
								</>
							) : (
								<DropdownMenuItem
									variant="destructive"
									onClick={() =>
										void leaveShared(
											"subscription",
											subscription
										)
									}
								>
									<LogOut /> Remove from my list
								</DropdownMenuItem>
							)}
						</>
					)
					return (
						<WithContextMenu
							key={subscription.id}
							className="w-48"
							menu={menuItems}
						>
							<TableRow
								data-focused={
									focus.has(subscription.id) || undefined
								}
								className={cn(
									subscription.access !== "view" &&
										"cursor-pointer",
									!subscription.active && "opacity-60",
									focus.has(subscription.id) &&
										"bg-primary/8 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-primary/12"
								)}
								onClick={() => onEdit(subscription)}
							>
								<TableCell className="w-full max-w-0 pl-4">
									<div className="flex items-center gap-3">
										<CategoryIcon
											category={subscription.category}
											className="hidden sm:flex"
										/>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<span className="truncate font-medium">
													{subscription.name}
												</span>
												{!subscription.active && (
													<Badge variant="outline">
														Paused
													</Badge>
												)}
												<span
													role="presentation"
													onClick={(event) =>
														event.stopPropagation()
													}
													onKeyDown={(event) =>
														event.stopPropagation()
													}
													className="contents"
												>
													<ShareBadge
														item={subscription}
														onClick={() =>
															onShare(
																subscription
															)
														}
													/>
												</span>
											</div>
											<div className="truncate text-xs text-muted-foreground">
												{cycleLabel(subscription.cycle)}
												{account
													? ` · ${account.name}`
													: ""}
												{subscription.notes
													? ` · ${subscription.notes}`
													: ""}
											</div>
										</div>
									</div>
								</TableCell>
								<TableCell className="hidden whitespace-nowrap sm:table-cell">
									{subscription.active ? (
										<Tooltip>
											<TooltipTrigger
												render={
													<span className="cursor-default" />
												}
											>
												{subscriptionDueLabel(
													subscription.nextDue
												)}
											</TooltipTrigger>
											<TooltipContent>
												{formatLongDate(
													subscription.nextDue
												)}
											</TooltipContent>
										</Tooltip>
									) : (
										<span className="text-muted-foreground">
											—
										</span>
									)}
								</TableCell>
								<TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
									{subscription.lastCharge ? (
										<Tooltip>
											<TooltipTrigger
												render={
													<span className="cursor-default" />
												}
											>
												{formatRelativeDate(
													subscription.lastCharge.date
												)}
												{changed && (
													<Badge
														variant="secondary"
														className="ml-2"
													>
														{formatMoney(
															Math.abs(
																subscription
																	.lastCharge
																	.amount
															),
															subscription.currency
														)}
													</Badge>
												)}
											</TooltipTrigger>
											<TooltipContent>
												{formatLongDate(
													subscription.lastCharge.date
												)}{" "}
												·{" "}
												{formatMoney(
													Math.abs(
														subscription.lastCharge
															.amount
													),
													subscription.currency
												)}
												{changed
													? " — different from the tracked amount"
													: ""}
											</TooltipContent>
										</Tooltip>
									) : (
										"—"
									)}
								</TableCell>
								<TableCell className="text-right font-medium tabular-nums">
									<Money
										value={subscription.amount}
										currency={subscription.currency}
									/>
								</TableCell>
								<TableCell className="hidden text-right text-muted-foreground tabular-nums lg:table-cell">
									<Money
										value={subscription.monthly}
										currency={subscription.currency}
									/>
								</TableCell>
								<TableCell
									className="pr-4"
									onClick={(event) => event.stopPropagation()}
								>
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`${subscription.name} options`}
												/>
											}
										>
											<MoreHorizontal />
										</DropdownMenuTrigger>
										<DropdownMenuContent
											align="end"
											className="w-48"
										>
											{menuItems}
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						</WithContextMenu>
					)
				})}
			</TableBody>
		</Table>
	)
}
