import {
  ArrowRight,
  BriefcaseBusiness,
  CircleAlert,
  CircleCheck,
  Clock,
  Download,
  FileArchive,
  FileSpreadsheet,
  NotebookPen,
  Printer,
  Tags,
  type LucideIcon,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { AnimatedMoney } from '@/components/count-up'
import { TransactionSheet } from '@/components/transaction-sheet'
import { TransactionsTable } from '@/components/transactions-table'
import { CategoryIcon } from '@/components/tx-bits'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Transaction } from '@/lib/api'
import { useSession } from '@/lib/auth-client'
import { CATEGORY_META } from '@/lib/categories'
import { inHomeCurrency, useConverter } from '@/lib/currency'
import { DEMO_IDENTITY, demoMode } from '@/lib/demo'
import { formatMoney, formatShortDate } from '@/lib/format'
import { useOverview, useTransactions } from '@/lib/queries'
import {
  accountantPackage,
  buildTaxReport,
  defaultReportYear,
  downloadBlob,
  type ExportInput,
  quarters,
  reportYears,
  transactionsCsv,
} from '@/lib/tax-report'
import { useIntent, useUrlState } from '@/lib/url-state'
import { cn } from '@/lib/utils'

const monthName = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleString(undefined, { month: 'long' })

/** A year's money, tidied up and packaged for an accountant. */
export function TaxesPage() {
  const overview = useOverview()
  const txq = useTransactions(null)
  const converter = useConverter()
  const session = useSession().data
  const owner = demoMode ? DEMO_IDENTITY.name : session?.user.name

  const accounts = useMemo(() => overview.data?.accounts ?? [], [overview.data])
  const transactions = useMemo(() => txq.data?.transactions ?? [], [txq.data])
  const years = useMemo(() => reportYears(transactions), [transactions])
  const [yearParam, setYear] = useUrlState<string>('year', String(defaultReportYear(years)), years.map(String))
  const [accountId, setAccountId] = useUrlState<string>('account', 'all')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [view, setView] = useState<'months' | 'quarters'>('months')

  const year = Number(yearParam)
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const shownAccounts = useMemo(() => (accountId === 'all' ? accounts : accounts.filter((a) => a.id === accountId)), [accounts, accountId])

  const { original, converted, report, mixed } = useMemo(() => {
    const ids = new Set(shownAccounts.map((a) => a.id))
    const original = transactions.filter((t) => ids.has(t.accountId) && t.date >= from && t.date <= to)
    const home = inHomeCurrency(shownAccounts, original, converter)
    const converted = new Map(home.transactions.map((t) => [t.id, t]))
    return { original, converted, report: buildTaxReport(home.transactions), mixed: home.mixed }
  }, [transactions, shownAccounts, from, to, converter])

  // The review lists show each transaction in its own account's currency.
  const byId = useMemo(() => new Map(original.map((t) => [t.id, t])), [original])
  const back = (list: Transaction[]) => list.map((t) => byId.get(t.id) ?? t)

  const exportInput: ExportInput = { label: String(year), from, to, home: converter.home, accounts: shownAccounts, original, converted, report, owner }
  const suffix = accountId === 'all' ? '' : `-${(shownAccounts[0]?.name ?? 'account').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  function downloadPackage() {
    downloadBlob(`ledger-tax-${year}${suffix}.zip`, accountantPackage(exportInput, (v) => formatMoney(v, converter.home)))
    toast.success(`Saved the ${year} package`, { description: 'A summary, monthly totals and every transaction, ready to send.' })
  }
  function downloadCsv() {
    downloadBlob(`transactions-${year}${suffix}.csv`, new Blob([transactionsCsv(exportInput)], { type: 'text/csv;charset=utf-8' }))
  }

  const txLink = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ from, to, ...(accountId === 'all' ? {} : { account: accountId }), ...extra })
    return `/transactions?${q}`
  }

  const loading = !txq.data || !overview.data
  useIntent('download', () => original.length > 0 && downloadPackage(), !loading)
  const businessNet = report.businessIn - report.businessOut
  const untouched = report.businessIn === 0 && report.businessOut === 0
  const r = report.review
  const openItems = [r.uncategorized, r.untaggedIncome, r.businessNoNote, r.pending].filter((l) => l.length > 0).length

  const yearItems = years.map((y) => ({ value: String(y), label: y === new Date().getFullYear() ? `${y} (so far)` : String(y) }))
  const accountItems = [{ value: 'all', label: 'All accounts' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Taxes</h1>
          <p className="text-sm text-muted-foreground">
            Get a year ready for your accountant: tag what’s business, fix the loose ends, then download it all in one go.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <PlainSelect items={yearItems} value={yearParam} onChange={setYear} className="w-36" label="Tax year" />
          {accounts.length > 1 && <PlainSelect items={accountItems} value={accountId} onChange={setAccountId} className="w-44" label="Account" />}
        </div>
      </div>

      {txq.error && <p className="text-sm text-destructive">{txq.error.message}</p>}

      {/* The year at a glance, and the one button most people came here for. */}
      <Card className="relative gap-6 overflow-hidden bg-gradient-to-br from-primary/12 via-card to-card ring-primary/20 print:bg-none">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/10 blur-3xl print:hidden" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileSpreadsheet className="size-4" />
            </span>
            {year} tax report
          </CardTitle>
          <CardDescription>
            {loading
              ? ' '
              : `${formatShortDate(from)} – ${formatShortDate(to)} · ${report.count.toLocaleString()} transactions · ${shownAccounts.length} account${shownAccounts.length === 1 ? '' : 's'}${mixed ? ` · in ${converter.home} at today’s rates` : ''}`}
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={loading}>
              <Printer /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsv} disabled={loading || original.length === 0}>
              <Download /> CSV
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <Figure label="Income" value={report.income} loading={loading} hint="Pay and other money in" />
            <Figure label="Spending" value={report.spending} loading={loading} hint="After refunds, not counting transfers" />
            <Figure label="Business income" value={report.businessIn} loading={loading} accent icon={BriefcaseBusiness} />
            <Figure label="Business expenses" value={report.businessOut} loading={loading} accent icon={BriefcaseBusiness} />
            <Figure label="Business net" value={businessNet} loading={loading} accent sign negative={businessNet < 0} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-background/70 p-3 print:hidden">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <FileArchive className="size-4 shrink-0 text-primary" />
              <span>
                <span className="font-medium">Accountant package</span>
                <span className="text-muted-foreground"> · summary, monthly and quarterly totals, business income and expenses, and every transaction as CSVs</span>
              </span>
            </p>
            <Button onClick={downloadPackage} disabled={loading || original.length === 0}>
              <Download /> Download .zip
            </Button>
          </div>
          {!loading && untouched && original.length > 0 && (
            <p className="-mt-2 text-xs text-muted-foreground print:hidden">
              Nothing is tagged business yet. If you’re self-employed or do side work, tag those transactions on{' '}
              <Link to={txLink({ flow: 'out' })} className="font-medium text-primary underline-offset-4 hover:underline">
                Transactions
              </Link>{' '}
              (tick several and choose <span className="font-medium">Tag for taxes</span>) so they’re totalled on their own.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Before you send it</CardTitle>
          <CardDescription>
            {loading ? ' ' : openItems === 0 ? 'All tidy. Nothing left that an accountant would ask about.' : `${openItems} thing${openItems === 1 ? '' : 's'} an accountant is likely to ask about`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {loading ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <ReviewItem
                icon={Tags}
                title="Filed under Other"
                done="Every transaction has a category"
                body="Give these a category so they land in the right line of the summary."
                items={back(r.uncategorized)}
                link={txLink({ category: 'other' })}
                accounts={accounts}
                onSelect={setSelected}
              />
              <ReviewItem
                icon={BriefcaseBusiness}
                title="Income that isn’t tagged"
                done="All your income is tagged business or personal"
                body="Is it pay from an employer, money from clients, or a gift? Tag it so your accountant can tell."
                items={back(r.untaggedIncome)}
                link={txLink({ category: 'income', tag: 'untagged' })}
                accounts={accounts}
                onSelect={setSelected}
              />
              <ReviewItem
                icon={NotebookPen}
                title="Business expenses without a note"
                done="Every business expense says what it was for"
                body="A few words on what each was for (who you met, what the software is used for) makes them much easier to claim."
                items={back(r.businessNoNote)}
                link={txLink({ tag: 'business', flow: 'out' })}
                accounts={accounts}
                onSelect={setSelected}
              />
              <ReviewItem
                icon={Clock}
                title="Still pending"
                done="Nothing pending"
                body="These haven’t posted yet, so their amounts can still change."
                items={back(r.pending)}
                accounts={accounts}
                onSelect={setSelected}
              />
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5 print:grid-cols-1">
        <Card className="gap-0 pb-0 lg:col-span-3">
          <CardHeader className="pb-4">
            <CardTitle>By category</CardTitle>
            <CardDescription>Transfers between your own accounts are left out. Click a row to see its transactions.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <Skeleton className="mx-4 mb-4 h-64" />
            ) : report.byCategory.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">No transactions in {year}.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Category</TableHead>
                    <TableHead className="text-right">In</TableHead>
                    <TableHead className="text-right">Out</TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="inline-flex items-center gap-1 text-primary">
                        <BriefcaseBusiness className="size-3.5" /> Business
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byCategory.map((l) => {
                    const business = l.businessOut || l.businessIn
                    return (
                      <TableRow key={l.category} className="cursor-pointer">
                        <TableCell className="pl-4">
                          <Link to={txLink({ category: l.category })} className="flex items-center gap-2.5">
                            <CategoryIcon category={l.category} className="print:hidden" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{CATEGORY_META[l.category].label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {l.count} transaction{l.count === 1 ? '' : 's'}
                              </span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{l.moneyIn ? formatMoney(l.moneyIn, converter.home) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.moneyOut ? formatMoney(l.moneyOut, converter.home) : '—'}</TableCell>
                        <TableCell className={cn('pr-4 text-right tabular-nums', business ? 'font-medium text-primary' : 'text-muted-foreground')}>
                          {business ? formatMoney(l.businessOut || l.businessIn, converter.home) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 pb-0 lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle>Over the year</CardTitle>
            <CardDescription>Quarters line up with estimated tax instalments</CardDescription>
            <CardAction className="print:hidden">
              <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
                <TabsList>
                  <TabsTrigger value="months">Months</TabsTrigger>
                  <TabsTrigger value="quarters">Quarters</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <Skeleton className="mx-4 mb-4 h-64" />
            ) : report.byMonth.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{view === 'months' ? 'Month' : 'Quarter'}</TableHead>
                    <TableHead className="text-right">In</TableHead>
                    <TableHead className="text-right">Out</TableHead>
                    <TableHead className="pr-4 text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(view === 'months'
                    ? report.byMonth.map((m) => ({ key: m.month, label: monthName(m.month), ...m }))
                    : quarters(report.byMonth).map((q) => ({ key: q.quarter, label: q.quarter.slice(5), ...q }))
                  ).map((row) => {
                    const net = row.moneyIn - row.moneyOut
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="pl-4 font-medium">{row.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(row.moneyIn, converter.home)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(row.moneyOut, converter.home)}</TableCell>
                        <TableCell className={cn('pr-4 text-right tabular-nums', net < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                          {formatMoney(net, converter.home, { sign: true })}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="pl-4">Total</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(report.byMonth.reduce((s, m) => s + m.moneyIn, 0), converter.home)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(report.byMonth.reduce((s, m) => s + m.moneyOut, 0), converter.home)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">
                      {formatMoney(report.byMonth.reduce((s, m) => s + m.moneyIn - m.moneyOut, 0), converter.home, { sign: true })}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Ledger adds things up; it doesn’t give tax advice. Which expenses you can claim depends on where you live and your situation, so check
        with your accountant.
      </p>

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

function Figure({
  label,
  value,
  hint,
  loading,
  accent,
  sign,
  negative,
  icon: Icon,
}: {
  label: string
  value: number
  hint?: string
  loading: boolean
  accent?: boolean
  sign?: boolean
  negative?: boolean
  icon?: LucideIcon
}) {
  return (
    <div className="min-w-0">
      <p className={cn('flex items-center gap-1 text-xs font-medium', accent ? 'text-primary' : 'text-muted-foreground')}>
        {Icon && <Icon className="size-3.5" />}
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-24" />
      ) : (
        <p className={cn('mt-0.5 truncate text-2xl font-semibold tracking-tight tabular-nums', negative && 'text-destructive')}>
          <AnimatedMoney value={value} sign={sign} />
        </p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const PREVIEW = 25

function ReviewItem({
  icon: Icon,
  title,
  done,
  body,
  items,
  link,
  accounts,
  onSelect,
}: {
  icon: LucideIcon
  title: string
  done: string
  body: ReactNode
  items: Transaction[]
  link?: string
  accounts: Parameters<typeof TransactionsTable>[0]['accounts']
  onSelect: (t: Transaction) => void
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground">
        <CircleCheck className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        {done}
      </div>
    )
  }
  return (
    <div className={cn('overflow-hidden rounded-lg border', open && 'border-primary/30')}>
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
          <CircleAlert className="absolute -top-1 -right-1 size-3.5 fill-background text-amber-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {title} <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary tabular-nums">{items.length}</span>
          </p>
          <p className="text-xs text-muted-foreground">{body}</p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide' : 'Review'}
          </Button>
          {link && (
            <Button variant="ghost" size="sm" render={<Link to={link} />} nativeButton={false}>
              Transactions <ArrowRight />
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="border-t">
          <TransactionsTable transactions={items.slice(0, PREVIEW)} accounts={accounts} onSelect={onSelect} showAccount={accounts.length > 1} />
          {items.length > PREVIEW && link && (
            <p className="border-t p-2 text-center text-xs text-muted-foreground">
              Showing {PREVIEW} of {items.length}.{' '}
              <Link to={link} className="font-medium text-primary underline-offset-4 hover:underline">
                See them all
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function PlainSelect({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  className?: string
  label: string
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger className={className} aria-label={label}>
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
