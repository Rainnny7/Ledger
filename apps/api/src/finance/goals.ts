/**
 * Savings / pay-off goals: progress, pace and "what it takes" from the partial payments logged
 * toward each goal. Pure functions, so they're easy to test. Amounts come in and go out as decimals;
 * every sum and pace is worked out in whole cents.
 */
import { fromCents, mulCents, toCents } from "@ledger/shared/money"

/** Public export for routes and tests. */
export const GOAL_KINDS = ["save", "payoff"] as const
/** GoalKind values accepted by validation and routes. */
export type GoalKind = (typeof GOAL_KINDS)[number]

/** Shape of GoalRow as stored and returned by the API. */
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

/** Shape of GoalPaymentRow as stored and returned by the API. */
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

/** GoalStatus values accepted by validation and routes. */
export type GoalStatus =
	| "done"
	| "ahead"
	| "on-track"
	| "behind"
	| "overdue"
	| "no-date"

const DAY = 86_400_000
const MONTH_DAYS = 30.44
const toTime = (iso: string) =>
	Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const daysBetween = (from: string, to: string) =>
	Math.round((toTime(to) - toTime(from)) / DAY)
const addDaysIso = (iso: string, days: number) =>
	new Date(toTime(iso) + days * DAY).toISOString().slice(0, 10)

/** How the last few months of payments are averaged into a pace. */
const PACE_WINDOW_DAYS = 90

/** Progress, pace, and payment stats for a savings/payoff goal. */
export function summarizeGoal(
	goal: GoalRow,
	payments: GoalPaymentRow[],
	today: string
) {
	const sorted = payments.toSorted(
		(left, right) =>
			left.date.localeCompare(right.date) ||
			left.createdAt.localeCompare(right.createdAt)
	)
	const targetC = toCents(goal.target)
	const savedC = sorted.reduce(
		(runningCents, payment) => runningCents + toCents(payment.amount),
		0
	)
	const saved = fromCents(savedC)
	const remainingC = Math.max(0, targetC - savedC)
	const remaining = fromCents(remainingC)
	const progress =
		targetC > 0 ? Math.min(1, Math.max(0, savedC / targetC)) : 0

	// The day the running total first reached the target (and stayed there).
	let completedAt: string | null = null
	if (savedC >= targetC) {
		let running = 0
		for (const payment of sorted) {
			running += toCents(payment.amount)
			if (running >= targetC && !completedAt) {
				completedAt = payment.date
			}
			if (running < targetC) {
				completedAt = null
			}
		}
	}

	const created = goal.createdAt.slice(0, 10)
	const start =
		sorted[0] && sorted[0].date < created ? sorted[0].date : created

	// Pace: what came in over the last ~3 months (or since the goal started), per month.
	const windowStart =
		daysBetween(start, today) < PACE_WINDOW_DAYS
			? start
			: addDaysIso(today, -PACE_WINDOW_DAYS)
	const recent = sorted.filter(
		(payment) =>
			payment.date > windowStart ||
			(windowStart === start && payment.date >= start)
	)
	// Ignore the opening "already saved" lump when it's the only thing in the window.
	const recentSum =
		recent.reduce(
			(runningCents, payment) => runningCents + toCents(payment.amount),
			0
		) -
		(recent.length === 1 && recent[0].date <= created
			? toCents(recent[0].amount)
			: 0)
	const spanDays = Math.max(30, daysBetween(windowStart, today))
	const paceC = Math.max(0, mulCents(recentSum, MONTH_DAYS / spanDays))
	const pacePerMonth = fromCents(paceC)
	const projectedDate =
		remainingC > 0 && paceC > 0
			? addDaysIso(today, Math.ceil((remainingC / paceC) * MONTH_DAYS))
			: null

	const daysLeft = goal.targetDate
		? daysBetween(today, goal.targetDate)
		: null
	const neededPerMonth =
		daysLeft !== null && daysLeft > 0 && remainingC > 0
			? fromCents(
					mulCents(remainingC, 1 / Math.max(daysLeft / MONTH_DAYS, 1))
				)
			: null
	const neededPerWeek =
		daysLeft !== null && daysLeft > 0 && remainingC > 0
			? fromCents(mulCents(remainingC, 1 / Math.max(daysLeft / 7, 1)))
			: null

	let status: GoalStatus
	if (completedAt) {
		status = "done"
	} else if (!goal.targetDate || daysLeft === null) {
		status = "no-date"
	} else if (daysLeft < 0) {
		status = "overdue"
	} else {
		// Where a steady pace from the start would have you by today.
		const total = Math.max(1, daysBetween(start, goal.targetDate))
		const elapsed = Math.min(total, Math.max(0, daysBetween(start, today)))
		const expected = goal.target * (elapsed / total)
		if (saved >= expected + goal.target * 0.1) {
			status = "ahead"
		} else if (
			saved >= expected - goal.target * 0.02 ||
			(projectedDate && projectedDate <= goal.targetDate)
		) {
			status = "on-track"
		} else {
			status = "behind"
		}
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
		payments: sorted.toReversed(),
	}
}

/** GoalSummary values accepted by validation and routes. */
export type GoalSummary = ReturnType<typeof summarizeGoal>
