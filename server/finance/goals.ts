/**
 * Savings / pay-off goals: progress, pace and "what it takes" from the partial payments logged
 * toward each goal. Pure functions, so they're easy to test.
 */

export const GOAL_KINDS = ['save', 'payoff'] as const
export type GoalKind = (typeof GOAL_KINDS)[number]

export interface GoalRow {
  id: string
  name: string
  kind: GoalKind
  target: number
  currency: string
  targetDate: string | null
  icon: string
  color: string
  notes: string | null
  archived: boolean
  createdAt: string // SQLite UTC "YYYY-MM-DD HH:MM:SS"
}

export interface GoalPaymentRow {
  id: string
  goalId: string
  /** Positive moves you toward the goal; negative takes money back out. */
  amount: number
  date: string // YYYY-MM-DD
  note: string | null
  transactionId: string | null
  createdAt: string
}

export type GoalStatus = 'done' | 'ahead' | 'on-track' | 'behind' | 'overdue' | 'no-date'

const DAY = 86_400_000
const MONTH_DAYS = 30.44
const round = (n: number) => Math.round(n * 100) / 100
const toTime = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY)
const addDaysIso = (iso: string, days: number) => new Date(toTime(iso) + days * DAY).toISOString().slice(0, 10)

/** How the last few months of payments are averaged into a pace. */
const PACE_WINDOW_DAYS = 90

export function summarizeGoal(goal: GoalRow, payments: GoalPaymentRow[], today: string) {
  const sorted = [...payments].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const saved = round(sorted.reduce((s, p) => s + p.amount, 0))
  const remaining = Math.max(0, round(goal.target - saved))
  const progress = goal.target > 0 ? Math.min(1, Math.max(0, saved / goal.target)) : 0

  // The day the running total first reached the target (and stayed there).
  let completedAt: string | null = null
  if (saved >= goal.target) {
    let running = 0
    for (const p of sorted) {
      running = round(running + p.amount)
      if (running >= goal.target && !completedAt) completedAt = p.date
      if (running < goal.target) completedAt = null
    }
  }

  const created = goal.createdAt.slice(0, 10)
  const start = sorted[0] && sorted[0].date < created ? sorted[0].date : created

  // Pace: what came in over the last ~3 months (or since the goal started), per month.
  const windowStart = daysBetween(start, today) < PACE_WINDOW_DAYS ? start : addDaysIso(today, -PACE_WINDOW_DAYS)
  const recent = sorted.filter((p) => p.date > windowStart || (windowStart === start && p.date >= start))
  // Ignore the opening "already saved" lump when it's the only thing in the window.
  const recentSum = recent.reduce((s, p) => s + p.amount, 0) - (recent.length === 1 && recent[0].date <= created ? recent[0].amount : 0)
  const spanDays = Math.max(30, daysBetween(windowStart, today))
  const pacePerMonth = Math.max(0, round((recentSum / spanDays) * MONTH_DAYS))
  const projectedDate =
    remaining > 0 && pacePerMonth > 0 ? addDaysIso(today, Math.ceil((remaining / pacePerMonth) * MONTH_DAYS)) : null

  const daysLeft = goal.targetDate ? daysBetween(today, goal.targetDate) : null
  const neededPerMonth = daysLeft !== null && daysLeft > 0 && remaining > 0 ? round(remaining / Math.max(daysLeft / MONTH_DAYS, 1)) : null
  const neededPerWeek = daysLeft !== null && daysLeft > 0 && remaining > 0 ? round(remaining / Math.max(daysLeft / 7, 1)) : null

  let status: GoalStatus
  if (completedAt) status = 'done'
  else if (!goal.targetDate || daysLeft === null) status = 'no-date'
  else if (daysLeft < 0) status = 'overdue'
  else {
    // Where a steady pace from the start would have you by today.
    const total = Math.max(1, daysBetween(start, goal.targetDate))
    const elapsed = Math.min(total, Math.max(0, daysBetween(start, today)))
    const expected = goal.target * (elapsed / total)
    if (saved >= expected + goal.target * 0.1) status = 'ahead'
    else if (saved >= expected - goal.target * 0.02 || (projectedDate && projectedDate <= goal.targetDate)) status = 'on-track'
    else status = 'behind'
  }

  return {
    ...goal,
    saved,
    remaining,
    progress,
    completedAt,
    status,
    daysLeft,
    neededPerMonth,
    neededPerWeek,
    pacePerMonth,
    projectedDate,
    payments: [...sorted].reverse(),
  }
}

export type GoalSummary = ReturnType<typeof summarizeGoal>
