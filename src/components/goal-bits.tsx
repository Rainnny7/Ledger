import {
  Bike,
  Camera,
  Car,
  CreditCard,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Laptop,
  type LucideIcon,
  Music,
  PartyPopper,
  PiggyBank,
  Plane,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { createElement, type CSSProperties, type ReactNode } from 'react'
import { Money } from '@/components/money'
import type { Goal, GoalStatus } from '@/lib/api'
import { formatDate, formatRelativeDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export const GOAL_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  target: { icon: Target, label: 'Goal' },
  'piggy-bank': { icon: PiggyBank, label: 'Savings' },
  shield: { icon: ShieldCheck, label: 'Emergency fund' },
  plane: { icon: Plane, label: 'Travel' },
  home: { icon: Home, label: 'Home' },
  car: { icon: Car, label: 'Car' },
  laptop: { icon: Laptop, label: 'Tech' },
  gift: { icon: Gift, label: 'Gift' },
  'graduation-cap': { icon: GraduationCap, label: 'Education' },
  heart: { icon: Heart, label: 'Wedding' },
  gem: { icon: Gem, label: 'Treat' },
  'credit-card': { icon: CreditCard, label: 'Debt' },
  bike: { icon: Bike, label: 'Hobby' },
  music: { icon: Music, label: 'Music' },
  camera: { icon: Camera, label: 'Camera' },
  party: { icon: PartyPopper, label: 'Party' },
}

/** One solid accent per colour: used for icons, bars and rings, and as a soft tint behind icons. */
export const GOAL_COLORS: Record<string, { color: string; label: string }> = {
  sunset: { color: '#ee7d52', label: 'Sunset' },
  rose: { color: '#e5487f', label: 'Rose' },
  ocean: { color: '#1e9bd7', label: 'Ocean' },
  forest: { color: '#10a37a', label: 'Forest' },
  gold: { color: '#e0a000', label: 'Gold' },
  violet: { color: '#8b6cf0', label: 'Violet' },
  slate: { color: '#64748b', label: 'Slate' },
}

export const goalIcon = (key: string) => GOAL_ICONS[key]?.icon ?? Target
export const goalColor = (key: string) => (GOAL_COLORS[key] ?? GOAL_COLORS.sunset).color

/** Solid fill in the goal's colour (swatches, progress bars). */
export const accentStyle = (key: string): CSSProperties => ({ backgroundColor: goalColor(key) })

/** A quiet tile: the colour at low opacity behind an icon drawn in the colour itself. */
export const tintStyle = (key: string): CSSProperties => {
  const c = goalColor(key)
  return { backgroundColor: `color-mix(in oklab, ${c} 14%, transparent)`, color: c }
}

export function GoalIcon({ goal, className }: { goal: Pick<Goal, 'icon' | 'color'>; className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', className)} style={tintStyle(goal.color)}>
      {createElement(goalIcon(goal.icon), { className: 'size-[50%]' })}
    </span>
  )
}

/** Circular progress with the percentage in the middle. */
export function GoalRing({
  goal,
  size = 72,
  stroke = 7,
  className,
}: {
  goal: Pick<Goal, 'progress' | 'color'>
  size?: number
  stroke?: number
  className?: string
}) {
  const r = (size - stroke) / 2
  const len = 2 * Math.PI * r
  const c = goalColor(goal.color)
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={c}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - goal.progress)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">
        {Math.floor(goal.progress * 100)}%
      </span>
    </div>
  )
}

export function GoalBar({ goal, className }: { goal: Pick<Goal, 'progress' | 'color'>; className?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(goal.progress > 0 ? 2 : 0, goal.progress * 100)}%`, backgroundColor: goalColor(goal.color) }}
      />
    </div>
  )
}

export const STATUS_META: Record<GoalStatus, { label: string; className: string }> = {
  done: { label: 'Reached', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  ahead: { label: 'Ahead', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  'on-track': { label: 'On track', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  behind: { label: 'Behind', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  overdue: { label: 'Past due', className: 'bg-destructive/15 text-destructive' },
  'no-date': { label: 'No deadline', className: 'bg-muted text-muted-foreground' },
}

export function GoalStatusPill({ status, className }: { status: GoalStatus; className?: string }) {
  const m = STATUS_META[status]
  return <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium', m.className, className)}>{m.label}</span>
}

/** One encouraging line: what it takes, or when you'll get there. */
export function goalNudge(g: Goal): ReactNode {
  const money = (n: number) => <Money value={n} currency={g.currency} />
  const verb = g.kind === 'payoff' ? 'pay' : 'save'
  if (g.status === 'done') return g.kind === 'payoff' ? 'Paid off — nice work!' : 'Goal reached — nice work!'
  if (g.status === 'overdue') return 'The target date has passed'
  if (g.neededPerWeek !== null && g.neededPerMonth !== null && g.targetDate) {
    const Verb = verb[0].toUpperCase() + verb.slice(1)
    const per = g.daysLeft !== null && g.daysLeft < 45 ? <>{money(g.neededPerWeek)}/week</> : <>{money(g.neededPerMonth)}/month</>
    return (
      <>
        {Verb} {per} to reach it by {formatDate(g.targetDate)}
      </>
    )
  }
  if (g.projectedDate) return `At your pace you’ll get there ${formatRelativeDate(g.projectedDate)}`
  return g.saved > 0 ? 'Keep logging payments as you make them' : 'Log your first payment to get started'
}

