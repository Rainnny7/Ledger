import { Money } from "@/components/common/money"
import { Sparkles, X } from "lucide-react"
import { subscriptionDueLabel } from "@/components/subscriptions/subscription-utils"
import { CategoryIcon } from "@/components/transactions/tx-bits"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import type { RecurringSuggestion } from "@/lib/api"
import { cycleLabel } from "@/lib/cycles"
import { cn } from "cn"

/** Detected recurring charges the user can start tracking or dismiss. */
export function SubscriptionSuggestionsCard({
	suggestions,
	focus,
	currency,
	onTrack,
	onDismiss,
}: {
	suggestions: RecurringSuggestion[]
	focus: Set<string>
	currency: (suggestion: RecurringSuggestion) => string
	onTrack: (suggestion: RecurringSuggestion) => void
	onDismiss: (suggestion: RecurringSuggestion) => void
}) {
	if (suggestions.length === 0) {
		return null
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Sparkles className="size-4" /> Detected recurring charges
				</CardTitle>
				<CardDescription>
					These repeat on a schedule in your transactions. Track them
					to see when they’re next due.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2 sm:grid-cols-2">
				{suggestions.map((suggestion) => (
					<div
						key={suggestion.id}
						data-focused={focus.has(suggestion.id) || undefined}
						className={cn(
							"flex items-center gap-3 rounded-lg border p-3",
							focus.has(suggestion.id) &&
								"border-primary/50 bg-primary/8 ring-1 ring-primary/30"
						)}
					>
						<CategoryIcon category={suggestion.category} />
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium">
								{suggestion.name}
							</div>
							<div className="truncate text-xs text-muted-foreground">
								<Money
									value={suggestion.amount}
									currency={currency(suggestion)}
								/>{" "}
								· {cycleLabel(suggestion.cycle).toLowerCase()} ·
								seen {suggestion.occurrences}×, next{" "}
								{subscriptionDueLabel(suggestion.nextDue)}
							</div>
						</div>
						<Button size="sm" onClick={() => onTrack(suggestion)}>
							Track
						</Button>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label={`Dismiss ${suggestion.name}`}
							onClick={() => onDismiss(suggestion)}
						>
							<X />
						</Button>
					</div>
				))}
			</CardContent>
		</Card>
	)
}
