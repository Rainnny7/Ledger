import { Money } from "@/components/common/money"
import { SubscriptionDateChip } from "@/components/subscriptions/subscription-date-chip"
import { subscriptionDueLabel } from "@/components/subscriptions/subscription-utils"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Subscription } from "@/lib/api"

export function SubscriptionComingUp({
  due30,
  onSelect,
}: {
  due30: { s: Subscription; date: string }[]
  onSelect: (s: Subscription) => void
}) {
  return (
    <>
      <CardHeader>
        <CardTitle>Coming up</CardTitle>
        <CardDescription>Next 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        {due30.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing due in the next 30 days.
          </p>
        ) : (
          <ul className="grid gap-0.5">
            {due30.slice(0, 10).map(({ s, date }) => (
              <li key={`${s.id}-${date}`}>
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <SubscriptionDateChip iso={date} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {subscriptionDueLabel(date)}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    <Money value={s.amount} currency={s.currency} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </>
  )
}
