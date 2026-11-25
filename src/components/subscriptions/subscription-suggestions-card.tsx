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

export function SubscriptionSuggestionsCard({
  suggestions,
  focus,
  currency,
  onTrack,
  onDismiss,
}: {
  suggestions: RecurringSuggestion[]
  focus: Set<string>
  currency: (g: RecurringSuggestion) => string
  onTrack: (g: RecurringSuggestion) => void
  onDismiss: (g: RecurringSuggestion) => void
}) {
  if (suggestions.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" /> Detected recurring charges
        </CardTitle>
        <CardDescription>
          These repeat on a schedule in your transactions. Track them to see
          when they’re next due.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((g) => (
          <div
            key={g.id}
            data-focused={focus.has(g.id) || undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3",
              focus.has(g.id) &&
                "border-primary/50 bg-primary/8 ring-1 ring-primary/30"
            )}
          >
            <CategoryIcon category={g.category} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{g.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                <Money value={g.amount} currency={currency(g)} /> ·{" "}
                {cycleLabel(g.cycle).toLowerCase()} · seen {g.occurrences}×,
                next {subscriptionDueLabel(g.nextDue)}
              </div>
            </div>
            <Button size="sm" onClick={() => onTrack(g)}>
              Track
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Dismiss ${g.name}`}
              onClick={() => onDismiss(g)}
            >
              <X />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
