import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, BellOff, EyeOff, Info, MoreHorizontal, PartyPopper, PiggyBank, type LucideIcon } from 'lucide-react'
import { useMemo, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { buildAdvice, type AdvisorReport, type Tip, type TipArea, type TipKind } from '@/lib/advisor'
import { api } from '@/lib/api'
import { inHomeCurrency, useConverter } from '@/lib/currency'
import { demoMode } from '@/lib/demo'
import { formatMoney, isoDate } from '@/lib/format'
import { useDashboardTransactions, useGoals, useOverview, useSubscriptions } from '@/lib/queries'
import { cn } from '@/lib/utils'

export const KIND_META: Record<TipKind, { label: string; icon: LucideIcon; className: string; card: string; text: string }> = {
  warn: {
    label: 'Heads up',
    icon: AlertTriangle,
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    card: 'border-amber-500/30 bg-amber-500/[0.07] dark:bg-amber-500/[0.06]',
    text: 'text-amber-700 dark:text-amber-400',
  },
  save: {
    label: 'Save money',
    icon: PiggyBank,
    className: 'bg-primary/12 text-primary',
    card: 'border-primary/30 bg-primary/[0.06]',
    text: 'text-primary',
  },
  info: {
    label: 'Worth knowing',
    icon: Info,
    className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    card: 'border-sky-500/30 bg-sky-500/[0.06]',
    text: 'text-sky-700 dark:text-sky-400',
  },
  win: {
    label: 'Nice work',
    icon: PartyPopper,
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    card: 'border-emerald-500/30 bg-emerald-500/[0.06]',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
}

/** The first sentence of a tip: the finding itself, short enough for the dashboard. */
export function headline(body: string) {
  return body.split(/(?<=[.!?])\s+(?=[A-Z0-9$])/)[0]
}

export const AREA_LABEL: Record<TipArea, string> = {
  spending: 'Spending',
  subscriptions: 'Subscriptions',
  fees: 'Fees',
  savings: 'Saving',
  goals: 'Goals',
  credit: 'Credit & bills',
}

/** Round yearly figure for a badge: "$410/yr". */
export const perYear = (n: number) => `${formatMoney(Math.round(n)).replace(/\.00$/, '')}/yr`

// Demo mode is read-only on the server, so hidden tips live in this tab until it reloads.
type Hidden = { id: string; until: string | null }[]
const NONE_HIDDEN: Hidden = []
let demoHidden: Hidden = []
const demoListeners = new Set<() => void>()
const demoStore = {
  subscribe: (l: () => void) => {
    demoListeners.add(l)
    return () => demoListeners.delete(l)
  },
  get: () => demoHidden,
  set: (next: typeof demoHidden) => {
    demoHidden = next
    for (const l of demoListeners) l()
  },
}

/**
 * The Advisor report for the signed-in person (or the demo), with hidden tips taken out.
 * Shares every query with the dashboard, so it costs nothing extra there.
 */
export function useAdvice() {
  const overview = useOverview()
  const txq = useDashboardTransactions()
  const subq = useSubscriptions()
  const goalq = useGoals()
  const converter = useConverter()
  const server = useQuery({ queryKey: ['advice'], queryFn: api.adviceDismissed, enabled: !demoMode })
  const local = useSyncExternalStore(demoStore.subscribe, demoStore.get)
  const hidden = demoMode ? local : (server.data?.dismissed ?? NONE_HIDDEN)

  const ready = Boolean(overview.data && txq.data && subq.data && goalq.data)
  const report = useMemo<AdvisorReport | null>(() => {
    if (!overview.data || !txq.data || !subq.data || !goalq.data) return null
    const home = inHomeCurrency(overview.data.accounts, txq.data.transactions, converter)
    if (home.transactions.length === 0) return null
    return buildAdvice({
      today: isoDate(),
      home: converter.home,
      accounts: home.accounts,
      transactions: home.transactions,
      subscriptions: subq.data.subscriptions,
      suggestions: subq.data.suggestions,
      goals: goalq.data.goals,
      toHome: converter.toOr,
    })
  }, [overview.data, txq.data, subq.data, goalq.data, converter])

  const hiddenIds = useMemo(() => new Set(hidden.map((h) => h.id)), [hidden])
  const tips = useMemo(() => (report?.tips ?? []).filter((t) => !hiddenIds.has(t.id)), [report, hiddenIds])
  const hiddenCount = (report?.tips.length ?? 0) - tips.length

  async function dismiss(tip: Tip, days?: number) {
    const undo = async () => {
      if (demoMode) demoStore.set(demoHidden.filter((h) => h.id !== tip.id))
      else await api.restoreAdvice(tip.id)
    }
    try {
      if (demoMode) {
        demoStore.set([...demoHidden.filter((h) => h.id !== tip.id), { id: tip.id, until: null }])
      } else {
        await api.dismissAdvice(tip.id, days)
      }
      toast.success(days ? `Snoozed for ${days} days` : 'Tip hidden', {
        action: { label: 'Undo', onClick: () => void undo().catch((e: Error) => toast.error(e.message)) },
      })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function restore() {
    try {
      if (demoMode) demoStore.set([])
      else await api.restoreAdvice()
      toast.success('Hidden tips are back')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return { report, tips, hiddenCount, loading: !ready, error: overview.error ?? txq.error, dismiss, restore }
}

export function TipIcon({ kind, className }: { kind: TipKind; className?: string }) {
  const meta = KIND_META[kind]
  const Icon = meta.icon
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', meta.className, className)}>
      <Icon className="size-4.5" />
    </span>
  )
}

/** One piece of advice: what's going on, what it's worth, and what to do about it. */
export function TipCard({
  tip,
  onDismiss,
  compact,
}: {
  tip: Tip
  onDismiss: (tip: Tip, days?: number) => void
  compact?: boolean
}) {
  const meta = KIND_META[tip.kind]
  const saving = tip.yearly !== undefined && tip.yearly >= 5 && tip.kind !== 'win' && (
    <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
      ~{perYear(tip.yearly)}
    </span>
  )
  const menu = (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="-mt-1 -mr-1 size-7 shrink-0 text-muted-foreground" aria-label="Tip options" />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onDismiss(tip, 30)}>
                <BellOff /> Snooze for 30 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDismiss(tip)}>
                <EyeOff /> Not useful, hide it
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
  )

  // The dashboard's version: the finding in one sentence, then what to do about it.
  if (compact) {
    return (
      <article className={cn('flex flex-col gap-2 rounded-lg border p-3', meta.card)}>
        <div className="flex items-start gap-2.5">
          <TipIcon kind={tip.kind} className="size-8" />
          <h3 className="min-w-0 flex-1 self-center text-sm font-medium leading-snug">{tip.title}</h3>
          {menu}
        </div>
        <p className="text-sm text-muted-foreground">{headline(tip.body)}</p>
        {(tip.action || saving) && (
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            {tip.action ? (
              <Link
                to={tip.action.to}
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 h-7 px-2 font-medium', meta.text)}
              >
                {tip.action.label} <ArrowRight />
              </Link>
            ) : (
              <span />
            )}
            {saving}
          </div>
        )}
      </article>
    )
  }

  return (
    <article className={cn('flex gap-3 rounded-lg border p-4', meta.card)}>
      <TipIcon kind={tip.kind} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug">{tip.title}</h3>
          {saving}
          {menu}
        </div>
        <p className="text-sm text-muted-foreground">{tip.body}</p>
        {tip.action && (
          <div>
            <Link to={tip.action.to} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-1 bg-background/60')}>
              {tip.action.label} <ArrowRight />
            </Link>
          </div>
        )}
      </div>
    </article>
  )
}
