import type { ReactNode } from 'react'
import { RefreshCWIcon } from '@/components/icons/refresh-cw'
import { useAnimatedIcon } from '@/components/icons/use-animated-icon'
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, History, KeyRound, MoreHorizontal, Plus, Trash2, Zap, ZapOff } from 'lucide-react'
import { AnimatedMoney } from '@/components/count-up'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { BalanceLabel, BalanceValue, CreditMeter, OverdraftMeter, overdraftAllowance, signedBalance, useIncludeOverdraft } from '@/components/account-figures'
import { BalanceChart, CashflowChart } from '@/components/charts'
import { ConnectDialog } from '@/components/connect-dialog'
import { GoalsSpotlight } from '@/components/goals-spotlight'
import { AccountDetailsButton } from '@/components/account-details-dialog'
import { InstitutionBadge, isProviderId, PROVIDERS } from '@/components/institution'
import { RangePicker, type RangeKey, rangeStart } from '@/components/range-picker'
import { TransactionSheet } from '@/components/transaction-sheet'
import { CategoryIcon, RelativeDate } from '@/components/tx-bits'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { type Account, api, type Connection, type Subscription, type Transaction } from '@/lib/api'
import { balanceSeries, lastMonths, monthlyCashflow, pendingSpent, startOfMonth, totalDebtPaid, totalSpent } from '@/lib/finance'
import {
  ACCOUNT_TYPE_LABEL,
  daysFromToday,
  formatMoney,
  formatRelative,
  formatRelativeDate,
  isoDate,
} from '@/lib/format'
import { useSession } from '@/lib/auth-client'
import { inHomeCurrency, useConverter } from '@/lib/currency'
import { DEMO_IDENTITY, demoMode } from '@/lib/demo'
import { useDashboardTransactions, useOverview, useSubscriptions } from '@/lib/queries'
import { cn } from '@/lib/utils'

/** "Good morning, Sam", by the clock on this device. */
function Greeting() {
  const { data } = useSession()
  const hour = new Date().getHours()
  const part = hour < 5 ? 'evening' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  // Demo mode shows the made-up person, never the signed-in user's own name.
  const name = demoMode ? DEMO_IDENTITY.name : data?.user.name
  const first = name?.trim().split(/\s+/)[0]
  return <>{`Good ${part}${first ? `, ${first}` : ''}`}</>
}

export function DashboardPage() {
  const { data, loading, error } = useOverview()
  const txq = useDashboardTransactions()
  const subq = useSubscriptions()
  const [dialog, setDialog] = useState<{ open: boolean; connection: Connection | null; full?: boolean }>({
    open: false,
    connection: null,
  })
  const [range, setRange] = useState<RangeKey>('90d')
  const [selected, setSelected] = useState<Transaction | null>(null)

  const connections = data?.connections ?? []
  const accounts = useMemo(() => data?.accounts ?? [], [data])
  const transactions = useMemo(() => txq.data?.transactions ?? [], [txq.data])
  // Totals add up across currencies by restating every account in the home currency (today's rates).
  const converter = useConverter()
  const home = useMemo(() => inHomeCurrency(accounts, transactions, converter), [accounts, transactions, converter])
  const cad = home.accounts
  const deposit = cad.filter((a) => a.type === 'chequing' || a.type === 'savings' || a.type === 'wallet')

  const includeOverdraft = useIncludeOverdraft()
  const net = cad.reduce((s, a) => s + signedBalance(a, includeOverdraft), 0)
  const overdraftTotal = includeOverdraft ? deposit.reduce((s, a) => s + overdraftAllowance(a), 0) : 0
  const available = deposit.reduce((s, a) => s + (a.available ?? a.balance ?? 0), 0)
  const overdraftRoom = deposit.reduce((s, a) => s + Math.max(0, (a.available ?? 0) - Math.max(a.balance ?? 0, 0)), 0)
  const owing =
    cad.filter((a) => a.type === 'credit' || a.type === 'loan').reduce((s, a) => s + Math.abs(a.balance ?? 0), 0) +
    deposit.reduce((s, a) => s + Math.max(0, -(a.balance ?? 0)), 0)

  const cadTx = home.transactions

  const spend = useMemo(() => {
    const today = isoDate()
    const d = new Date()
    const prevStart = startOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    const prevMonthDays = new Date(d.getFullYear(), d.getMonth(), 0).getDate()
    // Same day-of-month last month, for a like-for-like comparison.
    const prevSameDay = isoDate(new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), prevMonthDays)))
    const month = cadTx.filter((t) => t.date >= startOfMonth() && t.date <= today)
    return {
      now: totalSpent(month),
      pending: pendingSpent(month),
      debt: totalDebtPaid(month),
      prev: totalSpent(cadTx.filter((t) => t.date >= prevStart && t.date <= prevSameDay)),
    }
  }, [cadTx])

  const series = useMemo(() => balanceSeries(cad, cadTx, rangeStart(range), includeOverdraft), [cad, cadTx, range, includeOverdraft])
  const flow = useMemo(() => monthlyCashflow(cadTx, lastMonths(6)), [cadTx])
  const upcoming = useMemo(
    () =>
      (subq.data?.subscriptions ?? [])
        .filter((s) => s.active && s.access === 'owner' && daysFromToday(s.nextDue) <= 14)
        .sort((a, b) => a.nextDue.localeCompare(b.nextDue)),
    [subq.data],
  )

  async function remove(c: Connection) {
    if (!confirm(`Remove ${c.label} and all of its synced data?`)) return
    await api.deleteConnection(c.id)
    toast.success('Connection removed')
  }

  async function toggleInstant(c: Connection) {
    if (demoMode) return toast.error('Demo mode is read-only. Exit demo mode to make changes.')
    try {
      if (c.instantUpdates) {
        await api.disableInstantUpdates(c.id)
        toast.success('Instant updates turned off')
      } else {
        await api.enableInstantUpdates(c.id)
        toast.success('Instant updates on', {
          description: 'PayPal will notify Ledger about payments made through your PayPal app, like invoice checkouts.',
        })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change instant updates')
    }
  }

  async function forget(c: Connection) {
    await api.forgetCredentials(c.id)
    toast.success('Saved credentials deleted')
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Greeting />
          </h1>
          <p className="text-sm text-muted-foreground">Balances, overdraft and activity from your linked banks.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, connection: null })}>
          <Plus /> Add account
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <EmptyState onAdd={() => setDialog({ open: true, connection: null })} />
      ) : (
        <>
          <GoalsSpotlight />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Total balance"
              value={<AnimatedMoney value={net} />}
              negative={net < 0}
              hint={
                overdraftTotal > 0
                  ? `Includes ${formatMoney(overdraftTotal)} of overdraft · ${cad.length} account${cad.length === 1 ? '' : 's'}`
                  : `What you have minus what you owe, ${cad.length} account${cad.length === 1 ? '' : 's'}`
              }
              note={
                home.skipped.length > 0
                  ? `Leaves out ${home.skipped.join(', ')} accounts (no exchange rate yet)`
                  : home.mixed
                    ? `In ${converter.home}, other currencies at today’s rates`
                    : undefined
              }
            />
            <Stat
              label="Available to spend"
              value={<AnimatedMoney value={available} />}
              negative={available < 0}
              hint={overdraftRoom > 0 ? `Includes ${formatMoney(overdraftRoom)} of overdraft room` : 'Across chequing, savings & wallets'}
            />
            <Stat label="Owing" value={<AnimatedMoney value={owing} />} hint="Credit, loans and overdraft in use" />
            <Stat
              label="Spent this month"
              value={txq.data ? <AnimatedMoney value={spend.now} /> : '—'}
              hint={[
                spend.prev > 0
                  ? `${spend.now <= spend.prev ? '↓' : '↑'} ${formatMoney(Math.abs(spend.now - spend.prev))} vs same point last month`
                  : 'Excludes transfers & income',
                spend.pending > 0 && `${formatMoney(spend.pending)} pending`,
                spend.debt > 0 && `+ ${formatMoney(spend.debt)} loan payments`,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Total balance</CardTitle>
                <CardDescription>All accounts combined, end of day</CardDescription>
                <CardAction>
                  <RangePicker value={range} onChange={setRange} options={['30d', '90d', '6m', '1y']} />
                </CardAction>
              </CardHeader>
              <CardContent>{txq.data ? <BalanceChart data={series} from={rangeStart(range)} /> : <Skeleton className="h-56" />}</CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Cash flow</CardTitle>
                <CardDescription>Money in vs out, last 6 months</CardDescription>
              </CardHeader>
              <CardContent>{txq.data ? <CashflowChart data={flow} /> : <Skeleton className="h-56" />}</CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming payments</CardTitle>
                <CardDescription>Subscriptions & bills due in the next 2 weeks</CardDescription>
                <CardAction>
                  <Link to="/subscriptions" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    View all <ChevronRight />
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <UpcomingList
                  items={upcoming}
                  empty={(subq.data?.subscriptions.length ?? 0) === 0}
                  suggestions={subq.data?.suggestions.length ?? 0}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Latest across all accounts</CardDescription>
                <CardAction>
                  <Link to="/insights" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    Insights <ChevronRight />
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-0.5">
                {txq.data && transactions.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
                )}
                {transactions.slice(0, 6).map((t) => {
                  const account = accounts.find((a) => a.id === t.accountId)
                  return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelected(t)}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <CategoryIcon category={t.category} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.merchant}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <RelativeDate date={t.date} seenAt={t.createdAt} /> · {account?.name}
                      </span>
                    </span>
                    <span className={cn('font-medium tabular-nums', t.amount > 0 && 'text-emerald-600 dark:text-emerald-400')}>
                      {formatMoney(t.amount, account?.currency, { sign: true })}
                    </span>
                  </button>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          {connections.map((c) => (
            <section key={c.id} className="grid gap-3">
              <div className="flex items-center gap-3">
                <InstitutionBadge institution={c.institution} className="size-8" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.usernameMasked} · synced {formatRelative(c.lastSyncedAt)}
                    {c.instantUpdates && (
                      <span title="PayPal sends Ledger webhooks for app payments">
                        {' '}
                        · <Zap className="inline size-3 text-primary" /> instant
                        {c.lastEventAt ? `, last event ${formatRelative(c.lastEventAt)}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                {/* Split button: Refresh fetches only what's new; the arrow offers a full re-read. */}
                <div className="flex">
                  <RefreshButton onClick={() => setDialog({ open: true, connection: c })} />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="-ml-px rounded-l-none"
                          aria-label="More refresh options"
                        />
                      }
                    >
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem onClick={() => setDialog({ open: true, connection: c, full: true })}>
                        <History />
                        <div className="grid">
                          <span>Force full refresh</span>
                          <span className="text-xs text-muted-foreground">
                            Re-read {isProviderId(c.institution) ? PROVIDERS[c.institution].history : 'all'} of history
                          </span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Connection options" />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {c.institution === 'paypal' && (
                      <>
                        <DropdownMenuItem onClick={() => void toggleInstant(c)}>
                          {c.instantUpdates ? <ZapOff /> : <Zap />}
                          <div className="grid">
                            <span>{c.instantUpdates ? 'Turn off instant updates' : 'Turn on instant updates'}</span>
                            <span className="text-xs text-muted-foreground">
                              Webhooks for payments made through your PayPal app. Needs a public https PUBLIC_URL.
                            </span>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {canForget(c) && (
                      <DropdownMenuItem onClick={() => void forget(c)}>
                        <KeyRound /> Forget saved password
                      </DropdownMenuItem>
                    )}
                    {canForget(c) && <DropdownMenuSeparator />}
                    <DropdownMenuItem variant="destructive" onClick={() => void remove(c)}>
                      <Trash2 /> Remove connection
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {c.lastError && (
                <p className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="size-3.5 shrink-0" /> Last refresh failed: {c.lastError}
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {accounts
                  .filter((a) => a.connectionId === c.id)
                  .map((a) => (
                    <AccountCard key={a.id} account={a} />
                  ))}
              </div>
            </section>
          ))}
        </>
      )}

      <ConnectDialog
        open={dialog.open}
        connection={dialog.connection}
        full={dialog.full}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />

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

/** API keys (PayPal) are needed for every refresh, so they can't be forgotten separately. */
function canForget(c: Connection) {
  return c.savedCredentials && !(isProviderId(c.institution) && PROVIDERS[c.institution].keepsSecret)
}

function Stat({ label, value, negative, hint, note }: { label: string; value: ReactNode; negative?: boolean; hint?: string; note?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl! font-semibold tabular-nums ${negative ? 'text-destructive' : ''}`}>{value}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {note && <p className="text-xs text-muted-foreground/80">{note}</p>}
      </CardHeader>
    </Card>
  )
}

function UpcomingList({ items, empty, suggestions }: { items: Subscription[]; empty: boolean; suggestions: number }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
        <CalendarClock className="size-6" />
        {empty ? (
          <p>
            No subscriptions tracked yet.
            {suggestions > 0 && (
              <>
                {' '}
                <Link to="/subscriptions" className="font-medium text-foreground underline-offset-4 hover:underline">
                  We found {suggestions} recurring charge{suggestions === 1 ? '' : 's'}
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <p>Nothing due in the next two weeks.</p>
        )}
      </div>
    )
  }
  return (
    <ul className="grid gap-0.5">
      {items.map((s) => {
        const days = daysFromToday(s.nextDue)
        return (
          <li key={s.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm">
            <CategoryIcon category={s.category} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="block text-xs text-muted-foreground">
                {days <= 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due ${formatRelativeDate(s.nextDue)}`}
              </span>
            </span>
            <span className="font-medium tabular-nums">{formatMoney(s.amount, s.currency)}</span>
          </li>
        )
      })}
    </ul>
  )
}

function AccountCard({ account: a }: { account: Account }) {
  // The whole card opens the account (a link stretched over it); the deposit-details button sits above that link.
  return (
    <div className="group relative rounded-xl has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <Card className="h-full transition-colors group-hover:bg-muted/50">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="truncate text-sm">{a.name}</CardTitle>
              <CardDescription className="text-xs">{a.numberMasked ?? ACCOUNT_TYPE_LABEL[a.type]}</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="secondary">{ACCOUNT_TYPE_LABEL[a.type]}</Badge>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">
                <BalanceLabel account={a} />
              </div>
              <BalanceValue account={a} className="text-xl font-semibold" />
            </div>
            {a.available !== null && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{a.type === 'credit' ? 'Available credit' : 'Available'}</div>
                <div className="text-sm tabular-nums">{formatMoney(a.available, a.currency)}</div>
              </div>
            )}
          </div>
          <OverdraftMeter account={a} compact />
          <CreditMeter account={a} />
          {a.type !== 'wallet' && (
            <div className="relative z-10 -mb-1 flex">
              <AccountDetailsButton account={a} size="xs" variant="ghost" className="-ml-2 text-muted-foreground hover:text-foreground" />
            </div>
          )}
        </CardContent>
      </Card>
      <Link to={`/accounts/${a.id}`} aria-label={`Open ${a.name}`} className="absolute inset-0 rounded-xl focus-visible:outline-none" />
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="items-center py-14 text-center">
      <CardContent className="flex flex-col items-center gap-4">
        <div className="flex -space-x-2">
          <InstitutionBadge institution="td" className="size-12 text-base ring-4 ring-card" />
          <InstitutionBadge institution="paypal" className="size-12 text-base ring-4 ring-card" />
        </div>
        <div>
          <h2 className="font-semibold">Connect your first account</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Link TD EasyWeb or PayPal to see your balances, overdraft and transactions in one place.
          </p>
        </div>
        <Button onClick={onAdd}>
          <Plus /> Add account
        </Button>
      </CardContent>
    </Card>
  )
}

/** Refresh, with the arrows spinning while you hover it. */
function RefreshButton({ onClick }: { onClick: () => void }) {
  const icon = useAnimatedIcon<HTMLButtonElement>()
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-r-none"
      title="Fetch new transactions since the last sync"
      {...icon.handlers}
      onClick={onClick}
    >
      <RefreshCWIcon ref={icon.ref} size={14} className="flex" /> Refresh
    </Button>
  )
}
