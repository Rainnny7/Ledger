import { WithContextMenu } from '@/components/app-context-menu'
import { confirmDialog } from '@/components/confirm-dialog'
import { Money } from '@/components/money'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, LogOut, MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Share2, Sparkles, Trash2, X } from 'lucide-react'
import { AnimatedMoney } from '@/components/count-up'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { type SubscriptionDraft, SubscriptionDialog } from '@/components/subscription-dialog'
import { CategoryIcon } from '@/components/tx-bits'
import { Badge } from '@/components/ui/badge'
import { ShareBadge, ShareDialog } from '@/components/share-bits'
import { leaveShared, splitShared } from '@/lib/sharing'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, type RecurringSuggestion, type Subscription } from '@/lib/api'
import { cycleLabel, shiftCycle } from '@/lib/cycles'
import { addDays, daysFromToday, formatLongDate, formatMoney, formatRelativeDate, isoDate, parseIso } from '@/lib/format'
import { useConverter } from '@/lib/currency'
import { useOverview, useSubscriptions } from '@/lib/queries'
import { useIntent } from '@/lib/url-state'
import { cn } from '@/lib/utils'
import { useNow } from '@/lib/use-now'

/** Every billing date of `s` between from..to (inclusive), anchored on its next due date. */
function occurrences(s: Subscription, from: string, to: string) {
  const out: string[] = []
  const floor = s.anchorDate < from ? from : s.anchorDate
  for (let n = -60; n <= 60; n++) {
    const d = shiftCycle(s.nextDue, s.cycle, n)
    if (d > to) break
    if (d >= from && d >= floor) out.push(d)
  }
  return out
}

function dueLabel(iso: string) {
  const days = daysFromToday(iso)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return formatRelativeDate(iso)
}

export function SubscriptionsPage() {
  // Writes below invalidate every query (see queries.ts), so nothing here reloads by hand.
  const { data, loading, error } = useSubscriptions()
  const overview = useOverview()
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState<SubscriptionDraft | null>(null)
  const [editing, setEditing] = useState<Subscription | null>(null)

  const accounts = overview.data?.accounts ?? []
  const [sharing, setSharing] = useState<Subscription | null>(null)
  // Totals, the calendar and "coming up" are your own bills; ones shared with you are listed below them.
  const { own: subs, shared } = useMemo(() => splitShared(data?.subscriptions ?? []), [data])
  const suggestions = data?.suggestions ?? []
  const active = subs.filter((s) => s.active)
  const sorted = useMemo(
    () => [
      ...[...subs].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDue.localeCompare(b.nextDue)),
      ...[...shared].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDue.localeCompare(b.nextDue)),
    ],
    [subs, shared],
  )

  // Plans can be billed in different currencies; totals are in the home currency at today's rates.
  const fx = useConverter()
  const monthly = fx.sum(active.map((x) => [x.monthly, x.currency]))
  const suggestionCurrency = (g: RecurringSuggestion) => accounts.find((a) => a.id === g.accountId)?.currency ?? fx.home
  const next = [...active].sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0]
  const due30 = useMemo(() => {
    const today = isoDate()
    const end = addDays(today, 30)
    return active
      .flatMap((s) => occurrences(s, today, end).map((date) => ({ s, date })))
      .sort((a, b) => a.date.localeCompare(b.date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs])

  // Links from the Advisor (`?focus=id,id`) highlight the plans or spotted charges a tip is about.
  const focusParam = params.get('focus') ?? ''
  const focus = useMemo(() => new Set(focusParam.split(',').filter(Boolean)), [focusParam])
  const scrolledTo = useRef('')
  useEffect(() => {
    if (!focusParam || !data || scrolledTo.current === focusParam) return
    const el = document.querySelector('[data-focused="true"]')
    if (!el) return
    scrolledTo.current = focusParam
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusParam, data])

  // "Track as subscription" from a transaction lands here with a prefilled draft.
  useEffect(() => {
    const track = params.get('track')
    if (!track) return
    setEditing(null)
    setDraft({
      merchantKey: track,
      name: params.get('name') ?? '',
      amount: Number(params.get('amount')) || undefined,
      anchorDate: params.get('date') ?? isoDate(),
      accountId: params.get('account'),
      cycle: 'monthly',
    })
    setParams({}, { replace: true })
  }, [params, setParams])

  useIntent('new', () => {
    setEditing(null)
    setDraft({ cycle: 'monthly', anchorDate: isoDate() })
  })

  function edit(s: Subscription) {
    if (s.access === 'view') return
    setEditing(s)
    setDraft({
      id: s.id,
      name: s.name,
      amount: s.amount,
      cycle: s.cycle,
      anchorDate: s.nextDue,
      category: s.category,
      accountId: s.accountId,
      merchantKey: s.merchantKey,
      notes: s.notes,
      currency: s.currency,
    })
  }

  async function toggle(s: Subscription) {
    try {
      await api.updateSubscription(s.id, { active: !s.active })
      toast.success(s.active ? `${s.name} paused` : `${s.name} resumed`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function remove(s: Subscription) {
    if (!(await confirmDialog({ title: `Stop tracking ${s.name}?`, description: 'It’s removed from your subscriptions. Your transactions aren’t affected.', action: 'Stop tracking', destructive: true }))) return
    try {
      await api.deleteSubscription(s.id)
      toast.success(`${s.name} removed`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function track(g: RecurringSuggestion) {
    try {
      await api.createSubscription({
        name: g.name,
        amount: g.amount,
        cycle: g.cycle,
        anchorDate: g.lastDate,
        category: g.category,
        accountId: g.accountId,
        merchantKey: g.merchantKey,
        currency: suggestionCurrency(g),
      })
      toast.success(`Tracking ${g.name}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function dismiss(g: RecurringSuggestion) {
    try {
      await api.dismissSuggestion(g.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">Recurring payments, when they’re due and what they cost you.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDraft({ cycle: 'monthly', anchorDate: isoDate() })
          }}
        >
          <Plus /> Add subscription
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Per month" value={<AnimatedMoney value={monthly} />} hint="Longer & shorter plans averaged" loading={loading && !data} />
        <Stat label="Per year" value={<AnimatedMoney value={monthly * 12} />} loading={loading && !data} />
        <Stat
          label="Due in the next 30 days"
          value={<AnimatedMoney value={fx.sum(due30.map((x) => [x.s.amount, x.s.currency]))} />}
          hint={`${due30.length} payment${due30.length === 1 ? '' : 's'}`}
          loading={loading && !data}
        />
        <Stat
          label="Next payment"
          value={next ? <AnimatedMoney value={next.amount} currency={next.currency} /> : '—'}
          hint={next ? `${next.name} · ${dueLabel(next.nextDue)}` : 'Nothing tracked yet'}
          loading={loading && !data}
        />
      </div>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" /> Detected recurring charges
            </CardTitle>
            <CardDescription>These repeat on a schedule in your transactions. Track them to see when they’re next due.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {suggestions.map((g) => (
              <div
                key={g.id}
                data-focused={focus.has(g.id) || undefined}
                className={cn('flex items-center gap-3 rounded-lg border p-3', focus.has(g.id) && 'border-primary/50 bg-primary/8 ring-1 ring-primary/30')}
              >
                <CategoryIcon category={g.category} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{g.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    <Money value={g.amount} currency={suggestionCurrency(g)} /> · {cycleLabel(g.cycle).toLowerCase()} · seen {g.occurrences}×, next {dueLabel(g.nextDue)}
                  </div>
                </div>
                <Button size="sm" onClick={() => void track(g)}>
                  Track
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Dismiss ${g.name}`} onClick={() => void dismiss(g)}>
                  <X />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CalendarCard
            subs={active}
            onSelect={edit}
            onAdd={(date) => {
              setEditing(null)
              setDraft({ cycle: 'monthly', anchorDate: date })
            }}
          />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
            <CardDescription>Next 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {due30.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nothing due in the next 30 days.</p>
            ) : (
              <ul className="grid gap-0.5">
                {due30.slice(0, 10).map(({ s, date }) => (
                  <li key={`${s.id}-${date}`}>
                    <button
                      type="button"
                      onClick={() => edit(s)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <DateChip iso={date} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="block text-xs text-muted-foreground">{dueLabel(date)}</span>
                      </span>
                      <span className="font-medium tabular-nums"><Money value={s.amount} currency={s.currency} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>All subscriptions</CardTitle>
          <CardDescription>
            {active.length} active{subs.length > active.length ? ` · ${subs.length - active.length} paused` : ''}
            {shared.length > 0 ? ` · ${shared.length} shared with you` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loading && !data ? (
            <div className="grid gap-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <Repeat className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No subscriptions yet</p>
                <p className="text-sm text-muted-foreground">
                  Add one manually, track a detected charge above, or open any transaction and choose “Track as subscription”.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Next payment</TableHead>
                  <TableHead className="hidden md:table-cell">Last charged</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Per month</TableHead>
                  <TableHead className="w-12 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s) => {
                  const account = accounts.find((a) => a.id === s.accountId)
                  const changed = s.lastCharge && Math.abs(Math.abs(s.lastCharge.amount) - s.amount) >= 0.01
                  const menuItems = (
                      <>
                        {s.access !== 'view' && (
                          <>
                            <DropdownMenuItem onClick={() => edit(s)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void toggle(s)}>
                              {s.active ? <Pause /> : <Play />} {s.active ? 'Pause' : 'Resume'}
                            </DropdownMenuItem>
                          </>
                        )}
                        {s.access === 'owner' ? (
                          <>
                            <DropdownMenuItem onClick={() => setSharing(s)}>
                              <Share2 /> Share
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => void remove(s)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <DropdownMenuItem variant="destructive" onClick={() => void leaveShared('subscription', s)}>
                            <LogOut /> Remove from my list
                          </DropdownMenuItem>
                        )}
                      </>
                    )
                    return (
                    <WithContextMenu key={s.id} className="w-48" menu={menuItems}>
                    <TableRow
                      data-focused={focus.has(s.id) || undefined}
                      className={cn(
                        s.access !== 'view' && 'cursor-pointer',
                        !s.active && 'opacity-60',
                        focus.has(s.id) && 'bg-primary/8 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-primary/12',
                      )}
                      onClick={() => edit(s)}
                    >
                      <TableCell className="w-full max-w-0 pl-4">
                        <div className="flex items-center gap-3">
                          <CategoryIcon category={s.category} className="hidden sm:flex" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{s.name}</span>
                              {!s.active && <Badge variant="outline">Paused</Badge>}
                              <span onClick={(e) => e.stopPropagation()} className="contents">
                                <ShareBadge item={s} onClick={() => setSharing(s)} />
                              </span>
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {cycleLabel(s.cycle)}
                              {account ? ` · ${account.name}` : ''}
                              {s.notes ? ` · ${s.notes}` : ''}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap sm:table-cell">
                        {s.active ? (
                          <Tooltip>
                            <TooltipTrigger render={<span className="cursor-default" />}>{dueLabel(s.nextDue)}</TooltipTrigger>
                            <TooltipContent>{formatLongDate(s.nextDue)}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                        {s.lastCharge ? (
                          <Tooltip>
                            <TooltipTrigger render={<span className="cursor-default" />}>
                              {formatRelativeDate(s.lastCharge.date)}
                              {changed && (
                                <Badge variant="secondary" className="ml-2">
                                  {formatMoney(Math.abs(s.lastCharge.amount), s.currency)}
                                </Badge>
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              {formatLongDate(s.lastCharge.date)} · {formatMoney(Math.abs(s.lastCharge.amount), s.currency)}
                              {changed ? ' — different from the tracked amount' : ''}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums"><Money value={s.amount} currency={s.currency} /></TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums lg:table-cell">
                        <Money value={s.monthly} currency={s.currency} />
                      </TableCell>
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${s.name} options`} />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {menuItems}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    </WithContextMenu>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ShareDialog kind="subscription" item={sharing} onClose={() => setSharing(null)} />
      <SubscriptionDialog
        draft={draft}
        existing={editing}
        accounts={accounts}
        onClose={() => {
          setDraft(null)
          setEditing(null)
        }}
      />
    </div>
  )
}

function Stat({ label, value, hint, loading }: { label: string; value: ReactNode; hint?: string; loading?: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {loading ? <Skeleton className="h-8 w-28" /> : <CardTitle className="text-2xl! font-semibold tabular-nums">{value}</CardTitle>}
        {hint && !loading && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  )
}

function DateChip({ iso }: { iso: string }) {
  const d = parseIso(iso)
  return (
    <span className="flex w-10 shrink-0 flex-col items-center rounded-md border py-0.5 leading-tight">
      <span className="text-[10px] font-medium text-muted-foreground uppercase">{d.toLocaleDateString('en-CA', { month: 'short' })}</span>
      <span className="text-sm font-semibold tabular-nums">{d.getDate()}</span>
    </span>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Month grid with each payment on its day. Clicking a day's empty space adds a subscription due then. */
function CalendarCard({
  subs,
  onSelect,
  onAdd,
}: {
  subs: Subscription[]
  onSelect: (s: Subscription) => void
  onAdd: (date: string) => void
}) {
  const [offset, setOffset] = useState(0)
  const now = useNow()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const start = isoDate(first)
  const end = isoDate(new Date(first.getFullYear(), first.getMonth(), daysInMonth))
  const today = isoDate(now)

  // The React Compiler memoizes this; a manual useMemo here only stopped it from optimizing.
  const byDay = new Map<string, Subscription[]>()
  for (const s of subs) for (const d of occurrences(s, start, end)) byDay.set(d, [...(byDay.get(d) ?? []), s])
  const fx = useConverter()
  const total = fx.sum([...byDay.values()].flat().map((s) => [s.amount, s.currency]))

  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDate(new Date(first.getFullYear(), first.getMonth(), i + 1))),
  ]

  return (
    <>
      <CardHeader>
        <CardTitle>{first.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}</CardTitle>
        <CardDescription>{formatMoney(total)} due this month</CardDescription>
        <CardAction className="flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(0)}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setOffset((o) => o + 1)}>
            <ChevronRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} />
            const items = byDay.get(d) ?? []
            return (
              <div
                key={d}
                onClick={(e) => {
                  // Payments are buttons of their own; only the space around them adds one.
                  if (!(e.target as HTMLElement).closest('button')) onAdd(d)
                }}
                className={cn(
                  'group/day flex min-h-16 cursor-pointer flex-col gap-0.5 rounded-md border p-1 text-left transition-colors hover:border-primary/40 hover:bg-primary/5',
                  d < today && 'bg-muted/40 text-muted-foreground',
                  d === today && 'border-primary',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs tabular-nums', d === today && 'font-semibold text-foreground')}>{Number(d.slice(8))}</span>
                  <button
                    type="button"
                    aria-label={`Add a subscription due ${formatLongDate(d)}`}
                    onClick={() => onAdd(d)}
                    className="grid size-4 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                {items.slice(0, 2).map((s) => (
                  <Tooltip key={s.id}>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => onSelect(s)}
                          className="truncate rounded-[4px] bg-chart-1/15 px-1 text-left text-[11px] leading-4 text-foreground hover:bg-chart-1/25"
                        />
                      }
                    >
                      {s.name}
                    </TooltipTrigger>
                    <TooltipContent>
                      {s.name} · {formatMoney(s.amount, s.currency)} · {formatLongDate(d)}
                    </TooltipContent>
                  </Tooltip>
                ))}
                {items.length > 2 && <span className="px-1 text-[11px] text-muted-foreground">+{items.length - 2} more</span>}
              </div>
            )
          })}
        </div>
      </CardContent>
    </>
  )
}
