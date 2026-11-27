import { WithContextMenu } from "@/components/layout/app-context-menu"
import { Money } from "@/components/common/money"
import { MoreHorizontal } from "lucide-react"
import { SubscriptionTableRowMenu } from "@/components/subscriptions/subscription-table-row-menu"
import { subscriptionDueLabel } from "@/components/subscriptions/subscription-utils"
import { CategoryIcon } from "@/components/transactions/tx-bits"
import { Badge } from "@/components/ui/badge"
import { ShareBadge } from "@/components/sharing/share-bits"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCell, TableRow } from "@/components/ui/table"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Account, Subscription } from "@/lib/api"
import { cycleLabel } from "@/lib/cycles"
import { formatLongDate, formatMoney, formatRelativeDate } from "@/lib/format"
import { cn } from "cn"

/** One subscription row with context menu and overflow actions. */
export function SubscriptionTableRow({
	subscription,
	account,
	focused,
	onEdit,
	onShare,
	onToggle,
	onRemove,
}: {
	subscription: Subscription
	account: Account | undefined
	focused: boolean
	onEdit: (subscription: Subscription) => void
	onShare: (subscription: Subscription) => void
	onToggle: (subscription: Subscription) => void
	onRemove: (subscription: Subscription) => void
}) {
	const changed =
		subscription.lastCharge &&
		Math.abs(
			Math.abs(subscription.lastCharge.amount) - subscription.amount
		) >= 0.01
	const menuItems = (
		<SubscriptionTableRowMenu
			subscription={subscription}
			onEdit={onEdit}
			onShare={onShare}
			onToggle={onToggle}
			onRemove={onRemove}
		/>
	)

	return (
		<WithContextMenu className="w-48" menu={menuItems}>
			<TableRow
				data-focused={focused || undefined}
				className={cn(
					subscription.access !== "view" && "cursor-pointer",
					!subscription.active && "opacity-60",
					focused &&
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
									<Badge variant="outline">Paused</Badge>
								)}
								<span
									role="presentation"
									onClick={(event) => event.stopPropagation()}
									onKeyDown={(event) =>
										event.stopPropagation()
									}
									className="contents"
								>
									<ShareBadge
										item={subscription}
										onClick={() => onShare(subscription)}
									/>
								</span>
							</div>
							<div className="truncate text-xs text-muted-foreground">
								{cycleLabel(subscription.cycle)}
								{account ? ` · ${account.name}` : ""}
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
								render={<span className="cursor-default" />}
							>
								{subscriptionDueLabel(subscription.nextDue)}
							</TooltipTrigger>
							<TooltipContent>
								{formatLongDate(subscription.nextDue)}
							</TooltipContent>
						</Tooltip>
					) : (
						<span className="text-muted-foreground">—</span>
					)}
				</TableCell>
				<TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
					{subscription.lastCharge ? (
						<Tooltip>
							<TooltipTrigger
								render={<span className="cursor-default" />}
							>
								{formatRelativeDate(
									subscription.lastCharge.date
								)}
								{changed && (
									<Badge variant="secondary" className="ml-2">
										{formatMoney(
											Math.abs(
												subscription.lastCharge.amount
											),
											subscription.currency
										)}
									</Badge>
								)}
							</TooltipTrigger>
							<TooltipContent>
								{formatLongDate(subscription.lastCharge.date)} ·{" "}
								{formatMoney(
									Math.abs(subscription.lastCharge.amount),
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
						<DropdownMenuContent align="end" className="w-48">
							{menuItems}
						</DropdownMenuContent>
					</DropdownMenu>
				</TableCell>
			</TableRow>
		</WithContextMenu>
	)
}
