import { Money } from "@/components/common/money"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { useState } from "react"
import { subscriptionOccurrences } from "@/components/subscriptions/subscription-utils"
import { Button } from "@/components/ui/button"
import {
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Subscription } from "@/lib/api"
import { formatLongDate, formatMoney, isoDate } from "@/lib/format"
import { useConverter } from "@/lib/currency"
import { useNow } from "@/lib/use-now"
import { cn } from "cn"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Month grid with each payment on its day. Clicking a day's empty space adds a subscription due then. */
export function SubscriptionCalendarCard({
	subs,
	onSelect,
	onAdd,
}: {
	subs: Subscription[]
	onSelect: (subscription: Subscription) => void
	onAdd: (date: string) => void
}) {
	const [offset, setOffset] = useState(0)
	const now = useNow()
	const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
	const daysInMonth = new Date(
		first.getFullYear(),
		first.getMonth() + 1,
		0
	).getDate()
	const start = isoDate(first)
	const end = isoDate(
		new Date(first.getFullYear(), first.getMonth(), daysInMonth)
	)
	const today = isoDate(now)

	const byDay = new Map<string, Subscription[]>()
	for (const subscription of subs) {
		for (const day of subscriptionOccurrences(subscription, start, end)) {
			byDay.set(day, [...(byDay.get(day) ?? []), subscription])
		}
	}
	const fx = useConverter()
	const total = fx.sum(
		[...byDay.values()]
			.flat()
			.map((subscription) => [subscription.amount, subscription.currency])
	)

	const cells: (string | null)[] = [
		...Array.from({ length: first.getDay() }, () => null),
		...Array.from({ length: daysInMonth }, (_, i) =>
			isoDate(new Date(first.getFullYear(), first.getMonth(), i + 1))
		),
	]

	return (
		<>
			<CardHeader>
				<CardTitle>
					{first.toLocaleDateString("en-CA", {
						month: "long",
						year: "numeric",
					})}
				</CardTitle>
				<CardDescription>
					{formatMoney(total)} due this month
				</CardDescription>
				<CardAction className="flex gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Previous month"
						onClick={() =>
							setOffset((offsetValue) => offsetValue - 1)
						}
					>
						<ChevronLeft />
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={offset === 0}
						onClick={() => setOffset(0)}
					>
						Today
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Next month"
						onClick={() =>
							setOffset((offsetValue) => offsetValue + 1)
						}
					>
						<ChevronRight />
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
					{WEEKDAYS.map((weekday) => (
						<div key={weekday} className="pb-1">
							{weekday}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7 gap-1">
					{cells.map((day, i) => {
						if (!day) {
							return <div key={`pad-${i}`} />
						}
						const items = byDay.get(day) ?? []
						return (
							<div
								key={day}
								role="presentation"
								onClick={(event) => {
									if (
										!(event.target as HTMLElement).closest(
											"button"
										)
									) {
										onAdd(day)
									}
								}}
								className={cn(
									"group/day flex min-h-16 cursor-pointer flex-col gap-0.5 rounded-md border p-1 text-left transition-colors hover:border-primary/40 hover:bg-primary/5",
									day < today &&
										"bg-muted/40 text-muted-foreground",
									day === today && "border-primary"
								)}
							>
								<div className="flex items-center justify-between">
									<span
										className={cn(
											"text-xs tabular-nums",
											day === today &&
												"font-semibold text-foreground"
										)}
									>
										{Number(day.slice(8))}
									</span>
									<button
										type="button"
										aria-label={`Add a subscription due ${formatLongDate(day)}`}
										onClick={() => onAdd(day)}
										className="grid size-4 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:text-foreground focus-visible:opacity-100"
									>
										<Plus className="size-3" />
									</button>
								</div>
								{items.slice(0, 2).map((subscription) => (
									<Tooltip key={subscription.id}>
										<TooltipTrigger
											render={
												<button
													type="button"
													onClick={() =>
														onSelect(subscription)
													}
													className="truncate rounded-[4px] bg-chart-1/15 px-1 text-left text-[11px] leading-4 text-foreground hover:bg-chart-1/25"
												/>
											}
										>
											{subscription.name}
										</TooltipTrigger>
										<TooltipContent>
											{subscription.name} ·{" "}
											<Money
												value={subscription.amount}
												currency={subscription.currency}
											/>{" "}
											· {formatLongDate(day)}
										</TooltipContent>
									</Tooltip>
								))}
								{items.length > 2 && (
									<span className="px-1 text-[11px] text-muted-foreground">
										+{items.length - 2} more
									</span>
								)}
							</div>
						)
					})}
				</div>
			</CardContent>
		</>
	)
}
