import {
  TransactionMenuItems,
  WithContextMenu,
} from "@/components/layout/app-context-menu"
import { Hint } from "@/components/common/hint"
import { Money } from "@/components/common/money"
import {
  shownRunningBalance,
  useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { BriefcaseBusiness, StickyNote } from "lucide-react"
import { Fragment, useMemo } from "react"
import { CategoryBadge, CategoryIcon } from "@/components/transactions/tx-bits"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Account, Transaction } from "@/lib/api"
import { formatDayHeading, formatLongDate } from "@/lib/format"
import { cn } from "cn"

interface Props {
  transactions: Transaction[]
  accounts: Account[]
  onSelect: (t: Transaction) => void
  showBalance?: boolean
  showAccount?: boolean
  /** Turns on a checkbox per row for picking several at once. */
  selection?: {
    ids: ReadonlySet<string>
    toggle: (t: Transaction, range: boolean) => void
  }
}

/** Transactions grouped under a heading per day (newest first, as given). */
export function TransactionsTable({
  transactions,
  accounts,
  onSelect,
  showBalance,
  showAccount,
  selection,
}: Props) {
  const includeOverdraft = useIncludeOverdraft()
  const byId = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  )
  const days = useMemo(() => {
    const out: { date: string; items: Transaction[] }[] = []
    for (const t of transactions) {
      const last = out[out.length - 1]
      if (last?.date === t.date) last.items.push(t)
      else out.push({ date: t.date, items: [t] })
    }
    return out
  }, [transactions])
  const cols = 3 + (showBalance ? 1 : 0) + (selection ? 1 : 0)

  return (
    <Table>
      <TableHeader className="sr-only">
        <TableRow>
          {selection && <TableHead>Selected</TableHead>}
          <TableHead>Merchant</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Amount</TableHead>
          {showBalance && <TableHead>Balance</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map(({ date, items }) => (
          <Fragment key={date}>
            <TableRow className="border-b-0 bg-muted/40 hover:bg-muted/40">
              <TableCell
                colSpan={cols}
                className="px-4 py-1.5 text-xs font-medium text-muted-foreground"
              >
                <Hint label={formatLongDate(date)} side="right">
                  <time dateTime={date} className="cursor-default">
                    {formatDayHeading(date)}
                  </time>
                </Hint>
              </TableCell>
            </TableRow>
            {items.map((t) => {
              const account = byId.get(t.accountId)
              return (
                <WithContextMenu
                  key={t.id}
                  menu={
                    <TransactionMenuItems
                      transaction={t}
                      currency={account?.currency}
                      onOpen={() => onSelect(t)}
                    />
                  }
                >
                  <TableRow
                    tabIndex={0}
                    data-state={
                      selection?.ids.has(t.id) ? "selected" : undefined
                    }
                    className="cursor-pointer"
                    onClick={() => onSelect(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onSelect(t)
                      }
                    }}
                  >
                    {selection && (
                      <TableCell
                        className="w-0 pr-0 pl-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={`Select ${t.merchant}`}
                          checked={selection.ids.has(t.id)}
                          onClick={(e) => {
                            e.preventDefault()
                            selection.toggle(t, e.shiftKey)
                          }}
                        />
                      </TableCell>
                    )}
                    <TableCell className="w-full max-w-0 pl-4">
                      <div className="flex items-center gap-3">
                        <CategoryIcon
                          category={t.category}
                          className="hidden sm:flex"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">
                              {t.merchant}
                            </span>
                            {t.pending && (
                              <Badge variant="outline" className="shrink-0">
                                Pending
                              </Badge>
                            )}
                            {t.taxTag === "business" && (
                              <BriefcaseBusiness
                                className="size-3.5 shrink-0 text-primary"
                                aria-label="Business"
                              />
                            )}
                            {t.note && (
                              <StickyNote
                                className="size-3.5 shrink-0 text-muted-foreground"
                                aria-label="Has note"
                              />
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {showAccount && account ? `${account.name} · ` : ""}
                            {t.note || t.description}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <CategoryBadge category={t.category} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        !showBalance && "pr-4",
                        t.amount > 0 && "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      <Money
                        value={t.amount}
                        currency={account?.currency}
                        sign
                      />
                    </TableCell>
                    {showBalance && (
                      <TableCell className="hidden pr-4 text-right text-muted-foreground tabular-nums sm:table-cell">
                        <Money
                          value={shownRunningBalance(
                            t,
                            account,
                            includeOverdraft
                          )}
                          currency={account?.currency}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                </WithContextMenu>
              )
            })}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
