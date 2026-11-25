import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { AnimatedMoney } from '@/components/count-up'
import { useMemo, useState } from 'react'
import { CashflowChart, CategoryBars } from '@/components/charts'
import { RangePicker, type RangeKey, rangeStart } from '@/components/range-picker'
import { TransactionSheet } from '@/components/transaction-sheet'
import { TransactionsTable } from '@/components/transactions-table'
import { CategoryIcon } from '@/components/tx-bits'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Category, Transaction } from '@/lib/api'
import { CATEGORY_META } from '@/lib/categories'
import { isSpend, lastMonths, monthlyCashflow, spendByCategory, topMerchants, totalDebtPaid, totalIncome, totalSpent } from '@/lib/finance'
import { daysFromToday, formatMoney, isoDate } from '@/lib/format'
import { inHomeCurrency, useConverter } from '@/lib/currency'
import { useOverview, useTransactions } from '@/lib/queries'

const PAGE = 50

export function InsightsPage() {
  const overview = useOverview()
  const txq = useTransactions(null)
  const [range, setRange] = useState<RangeKey>('30d')
  const [category, setCategory] = useState<Category | null>(null)
  const [merchant, setMerchant] = useState<string | null>(null)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [limit, setLimit] = useState(PAGE)

  const accounts = useMemo(() => overview.data?.accounts ?? [], [overview.data])
  // Figures add up across currencies by restating every transaction in the home currency; the list
  // itself still shows each transaction as the bank recorded it.
  const converter = useConverter()
  const home = useMemo(() => inHomeCurrency(accounts, txq.data?.transactions ?? [], converter), [accounts, txq.data, converter])
  const all = home.transactions
  const original = useMemo(() => new Map((txq.data?.transactions ?? []).map((t) => [t.id, t])), [txq.data])
  const asRecorded = (t: Transaction) => original.get(t.id) ?? t
  const from = rangeStart(range)
  const inPeriod = useMemo(() => all.filter((t) => !from || t.date >= from), [all, from])

  const stats = useMemo(() => {
    const spent = totalSpent(inPeriod)
    const income = totalIncome(inPeriod)
    const debt = totalDebtPaid(inPeriod)
    const earliest = inPeriod.at(-1)?.date ?? isoDate()
    const days = Math.max(1, -daysFromToday(from && from > earliest ? from : earliest) + 1)
    return { spent, income, debt, net: income - spent - debt, perDay: spent / days, days }
  }, [inPeriod, from])

  const categories = useMemo(() => spendByCategory(inPeriod), [inPeriod])
  const merchants = useMemo(() => topMerchants(category ? inPeriod.filter((t) => t.category === category) : inPeriod), [inPeriod, category])
  const flow = useMemo(() => monthlyCashflow(all, lastMonths(12)), [all])

  const list = useMemo(
    () =>
      inPeriod.filter(
        (t) =>
          (category ? t.category === category && isSpend(t) : true) && (merchant ? t.merchantKey === merchant : true),
      ),
    [inPeriod, category, merchant],
  )

  const loading = !txq.data || !overview.data

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
          <p className="text-sm text-muted-foreground">Where your money goes, across every account. Transfers between accounts are ignored.</p>
        </div>
        <RangePicker
          value={range}
          onChange={(r) => {
            setRange(r)
            setLimit(PAGE)
          }}
        />
      </div>

      {txq.error && <p className="text-sm text-destructive">{txq.error.message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Spent" value={<AnimatedMoney value={stats.spent} />} hint="Net of refunds; excludes transfers & loan payments" loading={loading} />
        <Stat label="Income" value={<AnimatedMoney value={stats.income} />} hint="Pay and other money in" loading={loading} />
        <Stat
          label="Net"
          value={<AnimatedMoney value={stats.net} sign />}
          negative={stats.net < 0}
          hint={stats.debt > 0 ? `Income − spent − ${formatMoney(stats.debt)} loan payments` : 'Income − spent'}
          loading={loading}
        />
        <Stat label="Average spend / day" value={<AnimatedMoney value={stats.perDay} />} hint={`Over ${stats.days} days`} loading={loading} />
      </div>
      {(home.mixed || home.skipped.length > 0) && (
        <p className="-mt-6 text-xs text-muted-foreground">
          Figures in {converter.home}, other currencies converted at today’s rates
          {home.skipped.length > 0 && ` · ${home.skipped.join(', ')} accounts left out until rates load`}.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>Click a category to filter merchants and transactions</CardDescription>
            {category && (
              <CardAction>
                <Button variant="ghost" size="sm" onClick={() => setCategory(null)}>
                  <X /> Clear
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64" />
            ) : (
              <CategoryBars
                data={categories}
                selected={category}
                onSelect={(c) => {
                  setCategory((cur) => (cur === c ? null : c))
                  setMerchant(null)
                  setLimit(PAGE)
                }}
              />
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top merchants</CardTitle>
            <CardDescription>{category ? CATEGORY_META[category].label : 'All spending'}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64" />
            ) : merchants.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <ol className="grid gap-0.5">
                {merchants.map((m, i) => (
                  <li key={m.merchantKey}>
                    <button
                      type="button"
                      onClick={() => {
                        setMerchant((cur) => (cur === m.merchantKey ? null : m.merchantKey))
                        setLimit(PAGE)
                      }}
                      className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${merchant === m.merchantKey ? 'bg-muted' : ''}`}
                    >
                      <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                      <CategoryIcon category={m.category} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.merchant}</span>
                        <span className="block text-xs text-muted-foreground">
                          {m.count} transaction{m.count === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="font-medium tabular-nums">{formatMoney(m.total)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cash flow</CardTitle>
          <CardDescription>Money in vs out, last 12 months</CardDescription>
        </CardHeader>
        <CardContent>{loading ? <Skeleton className="h-56" /> : <CashflowChart data={flow} className="h-64" />}</CardContent>
      </Card>

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            {list.length} transaction{list.length === 1 ? '' : 's'}
            {category ? ` in ${CATEGORY_META[category].label}` : ''}
            {merchant ? ` at ${merchants.find((m) => m.merchantKey === merchant)?.merchant ?? 'this merchant'}` : ''}
          </CardDescription>
          {(category || merchant) && (
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCategory(null)
                  setMerchant(null)
                }}
              >
                <X /> Clear filters
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {list.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No transactions in this period.</p>
          ) : (
            <TransactionsTable transactions={list.slice(0, limit).map(asRecorded)} accounts={accounts} onSelect={setSelected} showAccount />
          )}
          {list.length > limit && (
            <div className="border-t p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE * 2)}>
                Show {Math.min(PAGE * 2, list.length - limit)} more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionSheet
        transaction={selected}
        transactions={txq.data?.transactions ?? []}
        accounts={accounts}
        onClose={() => setSelected(null)}
        onSelect={setSelected}
        onUpdated={(tx) => setSelected(tx)}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  negative,
  hint,
  loading,
}: {
  label: string
  value: ReactNode
  negative?: boolean
  hint?: string
  loading?: boolean
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <CardTitle className={`text-2xl! font-semibold tabular-nums ${negative ? 'text-destructive' : ''}`}>{value}</CardTitle>
        )}
        {hint && !loading && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  )
}
