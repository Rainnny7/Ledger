import { Money } from "@/components/common/money"
import type { Transaction } from "@/lib/api"
import { formatLongDate } from "@/lib/format"
import { cn } from "cn"

export function TransactionSheetHistory({
  merchant,
  history,
  currency,
  currentId,
  onSelect,
}: {
  merchant: string
  history: {
    list: Transaction[]
    count: number
    spent: number
    avg: number
    first?: string
  }
  currency: string
  currentId: string
  onSelect: (tx: Transaction) => void
}) {
  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-sm font-medium">{merchant} history</h3>
        <p className="text-xs text-muted-foreground">
          {history.count} transaction{history.count === 1 ? "" : "s"}
          {history.first ? ` since ${formatLongDate(history.first)}` : ""}
          {history.spent > 0 && (
            <>
              {" · "}
              <Money value={history.spent} currency={currency} /> spent · avg{" "}
              <Money value={history.avg} currency={currency} />
            </>
          )}
        </p>
      </div>
      <ul className="grid gap-0.5">
        {history.list.slice(0, 12).map((x) => (
          <li key={x.id}>
            <button
              type="button"
              onClick={() => onSelect(x)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                x.id === currentId && "bg-muted"
              )}
            >
              <span className="text-muted-foreground">
                {formatLongDate(x.date)}
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  x.amount > 0 && "text-emerald-600 dark:text-emerald-400"
                )}
              >
                <Money value={x.amount} currency={currency} sign />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
