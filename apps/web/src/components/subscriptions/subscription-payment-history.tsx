import { Money } from "@/components/common/money"
import { Separator } from "@/components/ui/separator"
import type { Subscription } from "@/lib/api"
import { formatLongDate } from "@/lib/format"

/** Scrollable list of the payments counted toward a subscription. */
export function SubscriptionPaymentHistory({
	existing,
}: {
	existing: Subscription
}) {
	if (existing.payments.length === 0) {
		return null
	}

	return (
		<>
			<Separator />
			<div className="grid min-w-0 gap-2">
				<h3 className="text-sm font-medium">Payment History</h3>
				<ul className="grid max-h-48 gap-0.5 overflow-y-auto text-sm">
					{existing.payments.map((payment) => (
						<li
							key={payment.id}
							className="flex justify-between rounded-md px-2 py-1 odd:bg-muted/50"
						>
							<span className="text-muted-foreground">
								{formatLongDate(payment.date)}
								{payment.linked && (
									<span className="ml-1.5 text-xs">
										· counted by hand
									</span>
								)}
							</span>
							<Money
								value={Math.abs(payment.amount)}
								currency={existing.currency}
								className="tabular-nums"
							/>
						</li>
					))}
				</ul>
			</div>
		</>
	)
}
