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
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight } from "lucide-react"

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
					<span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
						{itemCount} item{itemCount === 1 ? "" : "s"}
					</span>
				)}
			</CardHeader>
			<CardContent className="px-3 pb-4">
				{itemCount === 0 ? (
					<div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
						<span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
							<CheckCircle2 className="size-5" aria-hidden />
						</span>
						<p className="text-sm font-medium">You're all caught up</p>
						<p className="text-xs text-muted-foreground">
							Nothing needs your attention right now.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{alerts.length > 0 && (
							<section>
								<h3 className="px-2 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
									Needs attention
								</h3>
								<ul className="flex flex-col gap-1">
									{alerts.map((alert) => (
										<li
											key={alert.id}
											className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/5 px-2.5 py-2 transition-colors hover:bg-amber-500/10"
										>
											<div className="flex min-w-0 items-center gap-3">
												<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
													<AlertTriangle
														className="size-4"
														aria-hidden
													/>
												</span>
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
							</section>
						)}
						{dueSoon.length > 0 && (
							<section>
								<div className="flex items-center justify-between px-2 pb-1.5">
									<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										Coming up
									</h3>
									<Link
										to="/subscriptions"
										className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
									>
										View all
										<ChevronRight
											className="size-3.5"
											aria-hidden
										/>
									</Link>
								</div>
								<ul className="flex flex-col gap-1">
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
												className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/60"
											>
												<div className="flex min-w-0 items-center gap-3">
													<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
														<CalendarClock
															className="size-4"
															aria-hidden
														/>
													</span>
													<div className="min-w-0">
														<p className="truncate text-sm font-medium">
															{subscription.name}
														</p>
														<p
															className={cn(
																"text-xs text-muted-foreground",
																days <= 1 &&
																	"font-medium text-amber-700 dark:text-amber-400"
															)}
														>
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
							</section>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	)
}
