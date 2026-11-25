import { Link2, X } from "lucide-react"
import { Money } from "@/components/common/money"
import type { Goal } from "@/lib/api"
import { formatShortDate } from "@/lib/format"
import { cn } from "cn"

export function GoalCardPayments({
  goal: g,
  payments,
  showAll,
  canEdit,
  onToggleShowAll,
  onRemove,
}: {
  goal: Goal
  payments: Goal["payments"]
  showAll: boolean
  canEdit: boolean
  onToggleShowAll: () => void
  onRemove: (id: string) => void
}) {
  const done = g.status === "done"
  if (g.payments.length === 0) return null

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase">
          Payments
        </h3>
        {g.pacePerMonth > 0 && !done && (
          <span className="text-xs text-muted-foreground">
            ~<Money value={g.pacePerMonth} currency={g.currency} />
            /month lately
          </span>
        )}
      </div>
      <ul className="grid text-sm">
        {payments.map((p) => (
          <li
            key={p.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1 odd:bg-muted/40"
          >
            <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
              {formatShortDate(p.date)}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-muted-foreground">
              {p.transactionId && (
                <Link2
                  className="size-3 shrink-0"
                  aria-label="Linked to a transaction"
                />
              )}
              <span className="truncate">{p.note}</span>
            </span>
            <span
              className={cn(
                "tabular-nums",
                p.amount < 0
                  ? "text-destructive"
                  : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              <Money value={p.amount} currency={g.currency} sign />
            </span>
            {canEdit && (
              <button
                type="button"
                aria-label="Remove payment"
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                onClick={() => onRemove(p.id)}
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {g.payments.length > 3 && (
        <button
          type="button"
          className="w-fit text-xs font-medium text-primary hover:underline"
          onClick={onToggleShowAll}
        >
          {showAll ? "Show less" : `Show all ${g.payments.length}`}
        </button>
      )}
    </div>
  )
}
