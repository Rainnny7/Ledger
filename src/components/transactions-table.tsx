import { shownRunningBalance, useIncludeOverdraft } from '@/components/account-figures'
import { StickyNote } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { CategoryBadge, CategoryIcon } from '@/components/tx-bits'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Account, Transaction } from '@/lib/api'
import { formatDayHeading, formatLongDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  transactions: Transaction[]
  accounts: Account[]
  onSelect: (t: Transaction) => void
  showBalance?: boolean
  showAccount?: boolean
}

/** Transactions grouped under a heading per day (newest first, as given). */
export function TransactionsTable({ transactions, accounts, onSelect, showBalance, showAccount }: Props) {
  const includeOverdraft = useIncludeOverdraft()
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const days = useMemo(() => {
    const out: { date: string; items: Transaction[] }[] = []
    for (const t of transactions) {
      const last = out[out.length - 1]
      if (last?.date === t.date) last.items.push(t)
      else out.push({ date: t.date, items: [t] })
    }
    return out
  }, [transactions])
  const cols = 3 + (showBalance ? 1 : 0)

  return (
    <Table>
      <TableHeader className="sr-only">
        <TableRow>
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
              <TableCell colSpan={cols} className="px-4 py-1.5 text-xs font-medium text-muted-foreground">
                <time dateTime={date} title={formatLongDate(date)}>
                  {formatDayHeading(date)}
                </time>
              </TableCell>
            </TableRow>
            {items.map((t) => {
              const account = byId.get(t.accountId)
              return (
                <TableRow
                  key={t.id}
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => onSelect(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(t)
                    }
                  }}
                >
                  <TableCell className="w-full max-w-0 pl-4">
                    <div className="flex items-center gap-3">
                      <CategoryIcon category={t.category} className="hidden sm:flex" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{t.merchant}</span>
                          {t.pending && (
                            <Badge variant="outline" className="shrink-0">
                              Pending
                            </Badge>
                          )}
                          {t.note && <StickyNote className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has note" />}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {showAccount && account ? `${account.name} · ` : ''}
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
                      'text-right font-medium tabular-nums',
                      !showBalance && 'pr-4',
                      t.amount > 0 && 'text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {formatMoney(t.amount, account?.currency, { sign: true })}
                  </TableCell>
                  {showBalance && (
                    <TableCell className="hidden pr-4 text-right text-muted-foreground tabular-nums sm:table-cell">
                      {formatMoney(shownRunningBalance(t, account, includeOverdraft), account?.currency)}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
