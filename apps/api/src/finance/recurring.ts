import {
	PRESET_CYCLES,
	type Category,
	type Cycle,
	type CycleUnit,
	type PresetCycle,
} from "@ledger/shared/categories"
import { mulMoney, toCents } from "@ledger/shared/money"

const CUSTOM_CYCLE = /^every-(\d{1,3})-(weeks|months|years)$/
/** Upper bound per unit for custom periods (2 years of weeks, 10 years of months, 10 years). */
const CUSTOM_MAX: Record<CycleUnit, number> = {
	weeks: 104,
	months: 120,
	years: 10,
}

const PRESET_SPEC: Record<PresetCycle, { days: number } | { months: number }> =
	{
		weekly: { days: 7 },
		biweekly: { days: 14 },
		monthly: { months: 1 },
		quarterly: { months: 3 },
		semiannual: { months: 6 },
		yearly: { months: 12 },
		biennial: { months: 24 },
		triennial: { months: 36 },
	}

/** How far one cycle moves a date: a fixed number of days, or whole months (keeps the day of month). */
export function cycleSpec(cycle: Cycle): { days: number } | { months: number } {
	if (cycle in PRESET_SPEC) {
		return PRESET_SPEC[cycle as PresetCycle]
	}
	const match = CUSTOM_CYCLE.exec(cycle)
	if (!match) {
		return { months: 1 }
	}
	const interval = Number(match[1])
	return match[2] === "weeks"
		? { days: 7 * interval }
		: { months: match[2] === "months" ? interval : 12 * interval }
}

/** Whether a string is a preset or custom billing cycle. */
export function isCycle(v: unknown): v is Cycle {
	if (typeof v !== "string") {
		return false
	}
	if ((PRESET_CYCLES as readonly string[]).includes(v)) {
		return true
	}
	const match = CUSTOM_CYCLE.exec(v)
	return (
		!!match &&
		Number(match[1]) >= 1 &&
		Number(match[1]) <= CUSTOM_MAX[match[2] as CycleUnit]
	)
}

/** Average length of one cycle in days. */
export function cycleDays(cycle: Cycle): number {
	const spec = cycleSpec(cycle)
	return "days" in spec ? spec.days : spec.months * 30.4375
}

const DAY = 86_400_000
const toTime = (iso: string) =>
	Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
/** Milliseconds since epoch as YYYY-MM-DD (UTC date). */
export const toIso = (time: number) => new Date(time).toISOString().slice(0, 10)

function cycleFor(days: number): Cycle | null {
	if (days >= 6 && days <= 8) {
		return "weekly"
	}
	if (days >= 13 && days <= 16) {
		return "biweekly"
	}
	if (days >= 26 && days <= 35) {
		return "monthly"
	}
	if (days >= 85 && days <= 97) {
		return "quarterly"
	}
	if (days >= 350 && days <= 380) {
		return "yearly"
	}
	return null
}

/** Move an ISO date forward by n cycles, keeping the day-of-month for month-based cycles. */
export function addCycle(iso: string, cycle: Cycle, n = 1): string {
	const spec = cycleSpec(cycle)
	if ("days" in spec) {
		return toIso(toTime(iso) + n * spec.days * DAY)
	}
	const months = spec.months * n
	const year = +iso.slice(0, 4)
	const month = +iso.slice(5, 7) - 1 + months
	const day = +iso.slice(8, 10)
	const target = new Date(Date.UTC(year, month, 1))
	const lastDay = new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
	).getUTCDate()
	target.setUTCDate(Math.min(day, lastDay))
	return toIso(target.getTime())
}

/** First occurrence on or after `today`, rolling `anchor` forward by whole cycles. */
export function nextDue(anchor: string, cycle: Cycle, today: string): string {
	let current = anchor
	// Roll backward isn't needed: an anchor in the future is already the next due date.
	for (let i = 0; current < today && i < 2000; i++) {
		current = addCycle(anchor, cycle, i + 1)
	}
	return current
}

/** Normalize a recurring amount to a monthly figure for budgets. */
export function monthlyEquivalent(amount: number, cycle: Cycle) {
	return mulMoney(amount, cycleDays("monthly") / cycleDays(cycle))
}

/** Shape of TxLike as stored and returned by the API. */
export interface TxLike {
	date: string
	amount: number
	merchant: string
	merchantKey: string
	category: Category
}

/** Shape of RecurringGuess as stored and returned by the API. */
export interface RecurringGuess {
	/** Stable id for this suggestion: merchant key + rounded amount (a merchant can have several plans). */
	id: string
	merchantKey: string
	name: string
	category: Category
	amount: number
	cycle: Cycle
	lastDate: string
	nextDue: string
	occurrences: number
}

/** Never subscriptions: money moving between your own accounts, cash and pay. */
const NEVER_RECURRING = new Set<Category>(["transfers", "cash", "income"])
/**
 * Everyday spending: a charge here only counts as recurring when the amount is identical every
 * time and it happened at least three times (e.g. a DashPass or transit pass, not your usual coffee).
 */
const STRICT = new Set<Category>(["food", "groceries", "transport"])

/** How many of the most recent gaps between charges decide the cadence. */
const RECENT_GAPS = 6

/** Two charges are "the same plan" when they're within this much of each other. */
export const amountTolerance = (amount: number) => Math.max(0.5, amount * 0.2)

/** Split one merchant's charges into amount bands (a plan's price can change a little; other plans differ). */
function clusterByAmount(list: TxLike[], strict: boolean): TxLike[][] {
	const sorted = [...list].toSorted(
		(left, right) => Math.abs(right.amount) - Math.abs(left.amount)
	)
	const clusters: TxLike[][] = []
	for (const transaction of sorted) {
		const amt = Math.abs(transaction.amount)
		const cur = clusters[clusters.length - 1]
		// Compare against the band's largest charge so a band can't creep upward/downward indefinitely.
		const top = cur && Math.abs(cur[0].amount)
		if (
			cur &&
			(strict
				? toCents(top) === toCents(amt)
				: top - amt <= amountTolerance(amt))
		) {
			cur.push(transaction)
		} else {
			clusters.push([transaction])
		}
	}
	return clusters.map((cluster) =>
		cluster.toSorted((left, right) => left.date.localeCompare(right.date))
	)
}

/** Find charges that repeat at a regular cadence with a stable amount. */
export function detectRecurring(
	txs: TxLike[],
	today: string
): RecurringGuess[] {
	const groups = new Map<string, TxLike[]>()
	for (const transaction of txs) {
		if (
			transaction.amount >= 0 ||
			NEVER_RECURRING.has(transaction.category)
		) {
			continue
		}
		const group = groups.get(transaction.merchantKey)
		if (group) {
			group.push(transaction)
		} else {
			groups.set(transaction.merchantKey, [transaction])
		}
	}

	const out: RecurringGuess[] = []
	for (const [key, list] of groups) {
		if (list.length < 2) {
			continue
		}
		const ordered = list.toSorted((left, right) =>
			left.date.localeCompare(right.date)
		)
		const strict = STRICT.has(ordered[ordered.length - 1].category)
		let found = false
		for (const band of clusterByAmount(ordered, strict)) {
			const guess = cadenceOf(band, strict, today)
			if (!guess) {
				continue
			}
			found = true
			out.push({
				...guess,
				merchantKey: key,
				id: `${key}#${Math.round(guess.amount)}`,
			})
		}
		// No fixed-price plan, but the merchant as a whole bills on schedule (interest, metered bills).
		if (!found && !strict) {
			const guess = cadenceOf(ordered, false, today)
			if (guess) {
				out.push({ ...guess, merchantKey: key, id: key })
			}
		}
	}
	// One suggestion per id (two bands can round to the same dollar): keep the more established one.
	const byId = new Map<string, RecurringGuess>()
	for (const group of out) {
		if ((byId.get(group.id)?.occurrences ?? 0) < group.occurrences) {
			byId.set(group.id, group)
		}
	}
	return [...byId.values()].toSorted((left, right) =>
		left.nextDue.localeCompare(right.nextDue)
	)
}

function cadenceOf(
	band: TxLike[],
	strict: boolean,
	today: string
): Omit<RecurringGuess, "id" | "merchantKey"> | null {
	// Ignore same-day duplicates.
	const dates = [...new Set(band.map((transaction) => transaction.date))]
	if (dates.length < (strict ? 3 : 2)) {
		return null
	}
	// Judge the recent pattern: a plan that settled into a rhythm shouldn't be held back by a messy first year.
	const gaps = dates
		.slice(1)
		.map((date, i) => (toTime(date) - toTime(dates[i])) / DAY)
		.slice(-RECENT_GAPS)
	const sorted = [...gaps].toSorted((left, right) => left - right)
	const median = sorted[Math.floor(sorted.length / 2)]
	const cycle = cycleFor(median)
	if (!cycle) {
		return null
	}
	// Most gaps must agree with the cadence (a gap of two cycles is one skipped charge).
	const agree = gaps.filter(
		(gap) => cycleFor(gap) === cycle || cycleFor(gap / 2) === cycle
	).length
	if (agree / gaps.length < (strict ? 0.75 : 0.6)) {
		return null
	}
	// Needs 3+ charges unless monthly-or-longer (2 is enough to suggest a monthly bill).
	if (dates.length < 3 && (cycle === "weekly" || cycle === "biweekly")) {
		return null
	}
	// A weekly habit (Saturday coffee) isn't a subscription; everyday spending needs a long weekly run.
	if (
		strict &&
		dates.length < 6 &&
		(cycle === "weekly" || cycle === "biweekly")
	) {
		return null
	}
	const lastDate = dates[dates.length - 1]
	// Stale: missed more than two cycles → probably cancelled.
	if ((toTime(today) - toTime(lastDate)) / DAY > cycleDays(cycle) * 2 + 5) {
		return null
	}

	const last = band[band.length - 1]
	return {
		name: last.merchant,
		category:
			last.category === "other" || last.category === "shopping"
				? "subscriptions"
				: last.category,
		amount: Math.abs(last.amount),
		cycle,
		lastDate,
		nextDue: nextDue(addCycle(lastDate, cycle), cycle, today),
		occurrences: band.length,
	}
}
