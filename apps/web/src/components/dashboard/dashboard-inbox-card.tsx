import { Money } from "@/components/common/money"
import { hrefTarget } from "@/components/common/href-target"
import { useDashboardAlerts } from "@/components/dashboard/needs-attention"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Connection, Subscription, Transaction } from "@/lib/api"
import type { Converter } from "@/lib/currency"
import { daysFromToday, formatRelativeDate } from "@/lib/format"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"

/** Inbox: needs-attention alerts plus the next few upcoming payments. */
export function DashboardInboxCard({
	connections,
	transactions,
	converter,
	upcoming,
}: {
	connections: Connection[]
	transactions: Transaction[]
	converter: Converter
	upcoming: Subscription[]
}) {
	const alerts = useDashboardAlerts({ connections, transactions, converter })
	const dueSoon = upcoming.slice(0, 3)
	const itemCount = alerts.length + dueSoon.length

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardTitle>Inbox</CardTitle>
				{itemCount > 0 && (
					<span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
						{itemCount} item{itemCount === 1 ? "" : "s"}
					</span>
				)}
			</CardHeader>
			<CardContent className="px-2 pb-3">
				{itemCount === 0 ? (
					<p className="px-3 py-6 text-center text-sm text-muted-foreground">
						Nothing needs you right now.
					</p>
				) : (
					<>
						<ul>
							{alerts.map((alert) => (
								<li
									key={alert.id}
									className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
								>
									<div className="flex min-w-0 items-center gap-3">
										<span
											className="size-2 shrink-0 rounded-full bg-amber-500"
											aria-hidden
										/>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium">
												{alert.title}
											</p>
											<p className="truncate text-xs text-muted-foreground">
												{alert.detail}
											</p>
										</div>
									</div>
									<Button
										variant="outline"
										size="sm"
										nativeButton={false}
										render={
											<Link
												{...hrefTarget(alert.to)}
												hashScrollIntoView={{
													behavior: "smooth",
													block: "start",
												}}
											/>
										}
									>
										{alert.action}
									</Button>
								</li>
							))}
						</ul>
						{alerts.length > 0 && dueSoon.length > 0 && (
							<div
								className="mx-3 my-1.5 h-px bg-border"
								role="separator"
							/>
						)}
						{dueSoon.length > 0 && (
							<ul>
								{dueSoon.map((subscription) => {
									const days = daysFromToday(
										subscription.nextDue
									)
									const dueLabel =
										days <= 0
											? "Due today"
											: days === 1
												? "Due tomorrow"
												: `Due ${formatRelativeDate(subscription.nextDue)}`
									return (
										<li
											key={subscription.id}
											className="flex items-center justify-between gap-3 px-3 py-2"
										>
											<div className="flex min-w-0 items-center gap-3">
												<span
													className="size-2 shrink-0 rounded-full bg-muted-foreground/50"
													aria-hidden
												/>
												<div className="min-w-0">
													<p className="truncate text-sm font-medium">
														{subscription.name}
													</p>
													<p className="text-xs text-muted-foreground">
														{dueLabel}
													</p>
												</div>
											</div>
											<span className="shrink-0 text-sm font-semibold tabular-nums">
												<Money
													value={subscription.amount}
													currency={
														subscription.currency
													}
												/>
											</span>
										</li>
									)
								})}
							</ul>
						)}
						{dueSoon.length > 0 && (
							<div className="flex justify-end px-2 pt-1">
								<Link
									to="/subscriptions"
									className={cn(
										"text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
									)}
								>
									View all
								</Link>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	)
}
