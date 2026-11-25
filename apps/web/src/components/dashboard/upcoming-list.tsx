import { Money } from "@/components/common/money"
import { CategoryIcon } from "@/components/transactions/tx-bits"
import type { Subscription } from "@/lib/api"
import { daysFromToday, formatRelativeDate } from "@/lib/format"
import { CalendarClock } from "lucide-react"
import { Link } from "@tanstack/react-router"

/** Upcoming subscription payments, or an empty-state nudge to track or detect them. */
export function UpcomingList({
	items,
	empty,
	suggestions,
}: {
	items: Subscription[]
	empty: boolean
	suggestions: number
}) {
	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
				<CalendarClock className="size-6" />
				{empty ? (
					<p>
						No subscriptions tracked yet.
						{suggestions > 0 && (
							<>
								{" "}
								<Link
									to="/subscriptions"
									className="font-medium text-foreground underline-offset-4 hover:underline"
								>
									We found {suggestions} recurring charge
									{suggestions === 1 ? "" : "s"}
								</Link>
								.
							</>
						)}
					</p>
				) : (
					<p>Nothing due in the next two weeks.</p>
				)}
			</div>
		)
	}
	return (
		<ul className="grid gap-0.5">
			{items.map((subscription) => {
				const days = daysFromToday(subscription.nextDue)
				return (
					<li
						key={subscription.id}
						className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
					>
						<CategoryIcon category={subscription.category} />
						<span className="min-w-0 flex-1">
							<span className="block truncate font-medium">
								{subscription.name}
							</span>
							<span className="block text-xs text-muted-foreground">
								{days <= 0
									? "Due today"
									: days === 1
										? "Due tomorrow"
										: `Due ${formatRelativeDate(subscription.nextDue)}`}
							</span>
						</span>
						<span className="font-medium tabular-nums">
							<Money
								value={subscription.amount}
								currency={subscription.currency}
							/>
						</span>
					</li>
				)
			})}
		</ul>
	)
}
