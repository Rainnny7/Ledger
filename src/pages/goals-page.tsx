import { WithContextMenu } from '@/components/app-context-menu'
import { confirmDialog } from '@/components/confirm-dialog'
import { Money } from '@/components/money'
import type { ReactNode } from 'react'
import { Archive, ArchiveRestore, ChevronDown, Link2, LogOut, MoreHorizontal, Pencil, Plus, Share2, Target, Trash2, Trophy, Users, X } from 'lucide-react'
import { AnimatedMoney } from '@/components/count-up'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { GoalBar, GoalIcon, goalNudge, GoalRing, GoalStatusPill } from '@/components/goal-bits'
import { GoalDialog, GoalPaymentDialog, type PaymentDraft } from '@/components/goal-dialogs'
import { ShareBadge, ShareDialog } from '@/components/share-bits'
import { leaveShared, splitShared } from '@/lib/sharing'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Goal, type GoalInput } from '@/lib/api'
import { demoMode } from '@/lib/demo'
import { formatDate, formatShortDate, isoDate } from '@/lib/format'
import { useConverter } from '@/lib/currency'
import { useGoals } from '@/lib/queries'
import { cn } from '@/lib/utils'

const PRESETS: (Partial<GoalInput> & { blurb: string })[] = [
  { name: 'Emergency fund', icon: 'shield', color: 'forest', target: 5000, blurb: '3 months of essentials' },
  { name: 'Dream trip', icon: 'plane', color: 'ocean', target: 3000, blurb: 'Flights, hotel, fun money' },
  { name: 'Pay off my card', icon: 'credit-card', color: 'rose', kind: 'payoff', target: 1500, blurb: 'Be done with interest' },
  { name: 'New laptop', icon: 'laptop', color: 'violet', target: 1800, blurb: 'Upgrade without the debt' },
]

/** Open goals first: most urgent (soonest deadline, then furthest behind) up top. */
function byUrgency(a: Goal, b: Goal) {
  const rank = (g: Goal) => ({ overdue: 0, behind: 1, 'on-track': 2, ahead: 3, 'no-date': 4, done: 5 })[g.status]
  return rank(a) - rank(b) || (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || a.progress - b.progress
}

export function GoalsPage() {
  const { data, loading, error } = useGoals()
  const [creating, setCreating] = useState<Partial<GoalInput> | null>(null)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [paying, setPaying] = useState<PaymentDraft | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [sharing, setSharing] = useState<Goal | null>(null)

  // Links from the Advisor (`?focus=id`) bring the goal a tip is about into view.
  const [params] = useSearchParams()
  const focusParam = params.get('focus') ?? ''
  const scrolledTo = useRef('')
  useEffect(() => {
    if (!focusParam || !data || scrolledTo.current === focusParam) return
    const el = document.querySelector('[data-focused="true"]')
    if (!el) return
    scrolledTo.current = focusParam
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusParam, data])

  // Totals and sections are your own goals; ones shared with you get their own section.
  const { own: goals, shared } = useMemo(() => splitShared(data?.goals ?? []), [data])
  const sharedOpen = shared.filter((g) => !g.archived).sort(byUrgency)
  const open = useMemo(() => goals.filter((g) => !g.archived && g.status !== 'done').sort(byUrgency), [goals])
  const reached = goals.filter((g) => !g.archived && g.status === 'done')
  const archived = goals.filter((g) => g.archived)

  // Goals can be in different currencies; the totals are in the home currency at today's rates.
  const fx = useConverter()
  const saved = fx.sum(open.map((g) => [g.saved, g.currency]))
  const remaining = fx.sum(open.map((g) => [g.remaining, g.currency]))
  const perMonth = fx.sum(open.map((g) => [g.neededPerMonth ?? 0, g.currency]))
  const thisMonth = useMemo(() => {
    const prefix = isoDate().slice(0, 7)
    return fx.sum(goals.flatMap((g) => g.payments.filter((p) => p.date.startsWith(prefix)).map((p) => [p.amount, g.currency] as const)))
  }, [goals, fx])

  const startNew = (preset: Partial<GoalInput> = {}) => {
    if (demoMode) return toast.error('Demo mode is read-only. Exit demo mode to make changes.')
    setCreating(preset)
  }

  async function remove(g: Goal) {
    if (!(await confirmDialog({ title: `Delete “${g.name}”?`, description: `Its ${g.payments.length} payment${g.payments.length === 1 ? '' : 's'} are deleted too. This can’t be undone.`, action: 'Delete goal', destructive: true }))) return
    try {
      await api.deleteGoal(g.id)
      toast.success('Goal deleted')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function setArchived(g: Goal, value: boolean) {
    try {
      await api.updateGoal(g.id, { archived: value })
      toast.success(value ? `${g.name} archived` : `${g.name} restored`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const actions = {
    onPay: (goal: Goal) => setPaying({ goal }),
    onEdit: setEditing,
    onDelete: (g: Goal) => void remove(g),
    onArchive: (g: Goal) => void setArchived(g, !g.archived),
    onShare: (g: Goal) => (demoMode ? toast.error('Demo mode is read-only. Exit demo mode to make changes.') : setSharing(g)),
    onLeave: (g: Goal) => void leaveShared('goal', g),
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground">Save up for the things you want, or pay down what you owe — one payment at a time.</p>
        </div>
        <Button onClick={() => startNew()}>
          <Plus /> New goal
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!data && loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : goals.length === 0 && sharedOpen.length === 0 ? (
        <EmptyGoals onPick={startNew} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Put toward goals" value={<AnimatedMoney value={saved} />} hint={`${open.length} goal${open.length === 1 ? '' : 's'} in progress`} />
            <Stat label="Still to go" value={<AnimatedMoney value={remaining} />} />
            <Stat label="Needed per month" value={perMonth > 0 ? <AnimatedMoney value={perMonth} /> : '—'} hint="To hit every deadline" />
            <Stat label="This month" value={<AnimatedMoney value={thisMonth} sign={thisMonth !== 0} />} hint="Payments logged so far" />
          </div>

          {open.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {open.map((g) => (
                <GoalCard key={g.id} goal={g} {...actions} />
              ))}
            </div>
          ) : (
            <Card className="items-center py-10 text-center">
              <CardContent className="flex flex-col items-center gap-3">
                <Trophy className="size-8 text-amber-500" />
                <p className="font-medium">Every goal reached. What’s next?</p>
                <Button size="sm" onClick={() => startNew()}>
                  <Plus /> New goal
                </Button>
              </CardContent>
            </Card>
          )}

          {sharedOpen.length > 0 && (
            <section className="grid gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-primary" /> Shared with you
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {sharedOpen.map((g) => (
                  <GoalCard key={g.id} goal={g} {...actions} />
                ))}
              </div>
            </section>
          )}

          {reached.length > 0 && (
            <section className="grid gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="size-4 text-amber-500" /> Reached
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {reached.map((g) => (
                  <GoalCard key={g.id} goal={g} {...actions} />
                ))}
              </div>
            </section>
          )}

          {archived.length > 0 && (
            <section className="grid gap-3">
              <button
                type="button"
                className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setShowArchived((v) => !v)}
              >
                <ChevronDown className={cn('size-4 transition-transform', !showArchived && '-rotate-90')} />
                Archived ({archived.length})
              </button>
              {showArchived && (
                <div className="grid gap-4 opacity-80 md:grid-cols-2 animate-in fade-in-0 duration-200">
                  {archived.map((g) => (
                    <GoalCard key={g.id} goal={g} {...actions} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <GoalDialog open={!!creating || !!editing} goal={editing} preset={creating} onClose={() => {
          setCreating(null)
          setEditing(null)
        }} />
      <GoalPaymentDialog draft={paying} onClose={() => setPaying(null)} />
      <ShareDialog kind="goal" item={sharing} onClose={() => setSharing(null)} />
    </div>
  )
}

function GoalCard({
  goal: g,
  onPay,
  onEdit,
  onDelete,
  onArchive,
  onShare,
  onLeave,
}: {
  goal: Goal
  onPay: (g: Goal) => void
  onEdit: (g: Goal) => void
  onDelete: (g: Goal) => void
  onArchive: (g: Goal) => void
  onShare: (g: Goal) => void
  onLeave: (g: Goal) => void
}) {
  const owner = g.access === 'owner'
  const canEdit = g.access !== 'view'
  const [showAll, setShowAll] = useState(false)
  const payments = showAll ? g.payments : g.payments.slice(0, 3)
  const done = g.status === 'done'
  const [params] = useSearchParams()
  const focused = (params.get('focus') ?? '').split(',').includes(g.id)

  async function removePayment(id: string) {
    try {
      await api.deleteGoalPayment(g.id, id)
      toast.success('Payment removed')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const menuItems = (
    <>
      {!done && !g.archived && canEdit && (
        <>
          <DropdownMenuItem onClick={() => onPay(g)}>
            <Plus /> {g.kind === 'payoff' ? 'Log a payment' : 'Add money'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      {canEdit && (
        <DropdownMenuItem onClick={() => onEdit(g)}>
          <Pencil /> Edit
        </DropdownMenuItem>
      )}
      {owner ? (
        <>
          <DropdownMenuItem onClick={() => onShare(g)}>
            <Share2 /> Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onArchive(g)}>
            {g.archived ? <ArchiveRestore /> : <Archive />} {g.archived ? 'Restore' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(g)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </>
      ) : (
        <DropdownMenuItem variant="destructive" onClick={() => onLeave(g)}>
          <LogOut /> Remove from my goals
        </DropdownMenuItem>
      )}
    </>
  )

  return (
    <WithContextMenu menu={menuItems}>
    <Card className={cn('gap-0', focused && 'ring-2 ring-primary/60')} data-focused={focused || undefined}>
      <CardHeader className="flex items-start gap-3">
        <GoalIcon goal={g} />
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2">
            <span className="truncate">{g.name}</span>
            <GoalStatusPill status={g.status} />
            <ShareBadge item={g} onClick={() => onShare(g)} />
          </CardTitle>
          <CardDescription className="truncate">
            {g.kind === 'payoff' ? 'Paying off' : 'Saving up'}
            {g.targetDate && ` · by ${formatDate(g.targetDate)}`}
            {done && g.completedAt && ` · done ${formatDate(g.completedAt)}`}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`${g.name} options`} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="grid gap-4 pt-4">
        <div className="flex items-center gap-4">
          <GoalRing goal={g} />
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-semibold tabular-nums">
              <AnimatedMoney value={g.saved} currency={g.currency} />
              <span className="text-sm font-normal text-muted-foreground"> / <Money value={g.target} currency={g.currency} /></span>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{goalNudge(g)}</p>
          </div>
          {!done && (
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold tabular-nums"><Money value={g.remaining} currency={g.currency} /></p>
              <p className="text-xs text-muted-foreground">{g.kind === 'payoff' ? 'left to pay' : 'left to save'}</p>
            </div>
          )}
        </div>
        <GoalBar goal={g} />

        {g.notes && <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground italic">“{g.notes}”</p>}

        {!done && !g.archived && canEdit && (
          <Button variant="outline" size="sm" onClick={() => onPay(g)} className="w-fit">
            <Plus /> {g.kind === 'payoff' ? 'Log a payment' : 'Add money'}
          </Button>
        )}

        {g.payments.length > 0 && (
          <div className="grid gap-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase">Payments</h3>
              {g.pacePerMonth > 0 && !done && (
                <span className="text-xs text-muted-foreground">~<Money value={g.pacePerMonth} currency={g.currency} />/month lately</span>
              )}
            </div>
            <ul className="grid text-sm">
              {payments.map((p) => (
                <li key={p.id} className="group flex items-center gap-2 rounded-md px-2 py-1 odd:bg-muted/40">
                  <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{formatShortDate(p.date)}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-muted-foreground">
                    {p.transactionId && <Link2 className="size-3 shrink-0" aria-label="Linked to a transaction" />}
                    <span className="truncate">{p.note}</span>
                  </span>
                  <span className={cn('tabular-nums', p.amount < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                    <Money value={p.amount} currency={g.currency} sign />
                  </span>
                  {canEdit && (
                  <button
                    type="button"
                    aria-label="Remove payment"
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                    onClick={() => void removePayment(p.id)}
                  >
                    <X className="size-3.5" />
                  </button>
                  )}
                </li>
              ))}
            </ul>
            {g.payments.length > 3 && (
              <button type="button" className="w-fit text-xs font-medium text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show less' : `Show all ${g.payments.length}`}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </WithContextMenu>
  )
}

function EmptyGoals({ onPick }: { onPick: (preset?: Partial<GoalInput>) => void }) {
  return (
    <Card className="items-center py-12 text-center">
      <CardContent className="flex flex-col items-center gap-5">
        <span className="grid size-14 place-items-center rounded-2xl bg-sunset text-white shadow-sm">
          <Target className="size-7" />
        </span>
        <div>
          <h2 className="font-semibold">What are you working toward?</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Set a goal, log payments as you make them, and watch it fill up. Pick a starter or make your own.
          </p>
        </div>
        <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
          {PRESETS.map(({ blurb, ...p }) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onPick(p)}
              className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted"
            >
              <GoalIcon goal={{ icon: p.icon!, color: p.color! }} className="size-9" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{blurb}</span>
              </span>
            </button>
          ))}
        </div>
        <Button onClick={() => onPick()}>
          <Plus /> Custom goal
        </Button>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl! font-semibold tabular-nums">{value}</CardTitle>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  )
}
