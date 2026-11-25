import { ArrowDownLeft, ArrowUpRight, Download, Loader2, Search, Tags, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/confirm-dialog'
import { RANGES, type RangeKey, rangeStart } from '@/components/range-picker'
import { TransactionSheet } from '@/components/transaction-sheet'
import { TransactionsTable } from '@/components/transactions-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, type Category, type Transaction } from '@/lib/api'
import { CATEGORY_LIST, CATEGORY_META } from '@/lib/categories'
import { inHomeCurrency, useConverter } from '@/lib/currency'
import { demoMode } from '@/lib/demo'
import { downloadCsv } from '@/lib/finance'
import { formatMoney, formatShortDate } from '@/lib/format'
import { useOverview, useTransactions } from '@/lib/queries'
import { useUrlState } from '@/lib/url-state'

type Flow = 'all' | 'in' | 'out'
const PAGE = 100

const periodItems: { value: RangeKey; label: string }[] = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All time' },
]
const categoryItems = [{ value: 'all', label: 'All categories' }, ...CATEGORY_LIST.map((c) => ({ value: c, label: CATEGORY_META[c].label }))]
const recategorizeItems = [{ value: 'auto', label: 'Automatic' }, ...CATEGORY_LIST.map((c) => ({ value: c, label: CATEGORY_META[c].label }))]

/** Every transaction on every account, searchable, with bulk recategorizing. */
export function TransactionsPage() {
  const overview = useOverview()
  const txq = useTransactions(null)
  const converter = useConverter()

  const [query, setQuery] = useUrlState<string>('q', '')
  const [accountId, setAccountId] = useUrlState<string>('account', 'all')
  const [category, setCategory] = useUrlState<Category | 'all'>('category', 'all', ['all', ...CATEGORY_LIST])
  const [flow, setFlow] = useUrlState<Flow>('flow', 'all', ['all', 'in', 'out'])
  const [period, setPeriod] = useUrlState<RangeKey>('period', '90d', Object.keys(RANGES) as RangeKey[])
  // Links from elsewhere (the Advisor) can narrow to a few merchants and an exact start date.
  const [params, setParams] = useSearchParams()
  const merchantsParam = params.get('merchants') ?? ''
  const merchantKeys = useMemo(() => new Set(merchantsParam.split(',').filter(Boolean)), [merchantsParam])
  const sinceParam = params.get('from')
  const since = sinceParam && /^\d{4}-\d{2}-\d{2}$/.test(sinceParam) ? sinceParam : null
  /** Several filters change at once in one URL update (separate setters would each start from the old URL). */
  const updateParams = (edit: (p: URLSearchParams) => void) =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p)
        edit(out)
        return out
      },
      { replace: true, preventScrollReset: true },
    )
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const lastPicked = useRef<string | null>(null)

  const accounts = useMemo(() => overview.data?.accounts ?? [], [overview.data])
  const transactions = useMemo(() => txq.data?.transactions ?? [], [txq.data])
  const accountItems = useMemo(() => [{ value: 'all', label: 'All accounts' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))], [accounts])

  const from = since ?? rangeStart(period)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions.filter(
      (t) =>
        (!from || t.date >= from) &&
        (accountId === 'all' || t.accountId === accountId) &&
        (flow === 'all' || (flow === 'in' ? t.amount > 0 : t.amount < 0)) &&
        (category === 'all' || t.category === category) &&
        (merchantKeys.size === 0 || merchantKeys.has(t.merchantKey)) &&
        (!q ||
          t.description.toLowerCase().includes(q) ||
          t.merchant.toLowerCase().includes(q) ||
          (t.note ?? '').toLowerCase().includes(q) ||
          Math.abs(t.amount).toFixed(2).includes(q)),
    )
  }, [transactions, query, accountId, flow, category, from, merchantKeys])

  // Totals add up across currencies in the home currency.
  const totals = useMemo(() => {
    const home = inHomeCurrency(accounts, filtered, converter)
    let moneyIn = 0
    let moneyOut = 0
    for (const t of home.transactions) {
      if (t.amount > 0) moneyIn += t.amount
      else moneyOut -= t.amount
    }
    return { moneyIn, moneyOut, mixed: home.mixed }
  }, [accounts, filtered, converter])

  const shown = filtered.slice(0, limit)
  const pickedShown = shown.filter((t) => picked.has(t.id))
  const allShownPicked = shown.length > 0 && pickedShown.length === shown.length
  const filtersOn = query || accountId !== 'all' || category !== 'all' || flow !== 'all' || merchantKeys.size > 0 || since
  const merchantNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const t of transactions) if (merchantKeys.has(t.merchantKey) && !names.has(t.merchantKey)) names.set(t.merchantKey, t.merchant)
    return [...names.values()]
  }, [transactions, merchantKeys])
  const periodOptions = since ? [{ value: 'since', label: `Since ${formatShortDate(since)}` }, ...periodItems] : periodItems

  function changed() {
    setLimit(PAGE)
    setPicked(new Set())
    lastPicked.current = null
  }

  /** Shift-click picks everything between this row and the last one picked. */
  function toggle(t: Transaction, range: boolean) {
    setPicked((cur) => {
      const next = new Set(cur)
      const on = !cur.has(t.id)
      const a = lastPicked.current ? shown.findIndex((x) => x.id === lastPicked.current) : -1
      const b = shown.findIndex((x) => x.id === t.id)
      if (range && a >= 0 && b >= 0) {
        for (const x of shown.slice(Math.min(a, b), Math.max(a, b) + 1)) {
          if (on) next.add(x.id)
          else next.delete(x.id)
        }
      } else if (on) next.add(t.id)
      else next.delete(t.id)
      return next
    })
    lastPicked.current = t.id
  }

  async function recategorize(value: string) {
    if (demoMode) return toast.error('Demo mode is read-only. Exit demo mode to make changes.')
    const ids = [...picked]
    const label = value === 'auto' ? 'automatic' : CATEGORY_META[value as Category].label
    if (
      ids.length > 25 &&
      !(await confirmDialog({ title: `Recategorize ${ids.length} transactions?`, description: `They’ll all be filed under ${label}.`, action: 'Recategorize' }))
    ) {
      return
    }
    setApplying(true)
    try {
      const { updated } = await api.updateTransactions(ids, value === 'auto' ? null : (value as Category))
      toast.success(`${updated} transaction${updated === 1 ? '' : 's'} filed under ${label}`)
      setPicked(new Set())
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setApplying(false)
    }
  }

  function exportCsv() {
    const byId = new Map(accounts.map((a) => [a.id, a]))
    downloadCsv('transactions.csv', [
      ['Date', 'Account', 'Merchant', 'Description', 'Category', 'Amount', 'Currency', 'Pending', 'Note'],
      ...filtered.map((t) => [
        t.date,
        byId.get(t.accountId)?.name,
        t.merchant,
        t.description,
        CATEGORY_META[t.category].label,
        t.amount.toFixed(2),
        byId.get(t.accountId)?.currency,
        t.pending ? 'yes' : '',
        t.note,
      ]),
    ])
  }

  const loading = !txq.data || !overview.data

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">Everything across your accounts. Tick a few to file them under one category at once.</p>
      </div>

      {txq.error && <p className="text-sm text-destructive">{txq.error.message}</p>}

      <Card className="gap-0 pb-0">
        <CardHeader className="gap-4 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{loading ? 'Loading…' : `${filtered.length.toLocaleString()} transactions`}</CardTitle>
              <CardDescription>
                {loading ? ' ' : `of ${transactions.length.toLocaleString()}`}
                {totals.mixed && ` · totals in ${converter.home}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-emerald-600 tabular-nums dark:text-emerald-400">
                <ArrowDownLeft className="size-4" /> {formatMoney(totals.moneyIn)}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
                <ArrowUpRight className="size-4" /> {formatMoney(totals.moneyOut)}
              </span>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download /> CSV
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search merchant, description, note or amount"
                className="pl-8"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  changed()
                }}
              />
            </div>
            <FilterSelect items={accountItems} value={accountId} onChange={(v) => (setAccountId(v), changed())} className="w-44" />
            <FilterSelect
              items={periodOptions}
              value={since ? 'since' : period}
              onChange={(v) => {
                if (v === 'since') return
                if (since) updateParams((p) => (p.delete('from'), v === '90d' ? p.delete('period') : p.set('period', v)))
                else setPeriod(v as RangeKey)
                changed()
              }}
              className="w-36"
            />
            <FilterSelect items={categoryItems} value={category} onChange={(v) => (setCategory(v as Category | 'all'), changed())} className="w-44" />
            <Tabs value={flow} onValueChange={(v) => (setFlow(v as Flow), changed())}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="in">In</TabsTrigger>
                <TabsTrigger value="out">Out</TabsTrigger>
              </TabsList>
            </Tabs>
            {filtersOn && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  updateParams((p) => {
                    for (const k of ['q', 'account', 'category', 'flow', 'merchants', 'from']) p.delete(k)
                  })
                  changed()
                }}
              >
                <X /> Clear
              </Button>
            )}
          </div>
          {merchantNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Only</span>
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5">
                {merchantNames.length <= 3 ? merchantNames.join(', ') : `${merchantNames.slice(0, 2).join(', ')} and ${merchantNames.length - 2} more`}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="rounded-full"
                  aria-label="Show every merchant"
                  onClick={() => (updateParams((p) => p.delete('merchants')), changed())}
                >
                  <X />
                </Button>
              </span>
            </div>
          )}
          {shown.length > 0 && (
            <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPicked(allShownPicked ? new Set() : new Set(shown.map((t) => t.id)))}
              >
                {allShownPicked ? 'Select none' : `Select ${shown.length === filtered.length ? 'all' : `these ${shown.length}`}`}
              </Button>
              {picked.size > 0 && (
                <>
                  <span className="text-muted-foreground">{picked.size} selected</span>
                  <Select items={recategorizeItems} value={null} onValueChange={(v) => v && void recategorize(v as string)}>
                    <SelectTrigger size="sm" className="w-48" disabled={applying}>
                      {applying ? <Loader2 className="animate-spin" /> : <Tags />}
                      <SelectValue placeholder="Change category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {recategorizeItems.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="grid gap-2 px-4 pb-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {transactions.length === 0 ? 'No transactions yet. Connect a bank to see them here.' : 'No transactions match.'}
            </p>
          ) : (
            <TransactionsTable
              transactions={shown}
              accounts={accounts}
              onSelect={setSelected}
              showAccount={accounts.length > 1}
              selection={{ ids: picked, toggle }}
            />
          )}
          {filtered.length > limit && (
            <div className="border-t p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, filtered.length - limit)} more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionSheet
        transaction={selected}
        transactions={transactions}
        accounts={accounts}
        onClose={() => setSelected(null)}
        onSelect={setSelected}
        onUpdated={(tx) => setSelected(tx)}
      />
    </div>
  )
}

function FilterSelect({
  items,
  value,
  onChange,
  className,
}: {
  items: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
