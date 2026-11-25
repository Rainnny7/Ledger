import type { Account } from "../api.ts"
import { addDays } from "../format.ts"
import type { Tip, Ctx } from "./types.ts"
import {
	formatMoney,
	about,
	formatPercent,
	plural,
	subsLink,
} from "./helpers.ts"
import type { OwnSub } from "./subscriptions.ts"

/** Aggregate credit-card utilization across linked cards. */
export interface Credit {
	used: number
	limit: number
	util: number
	cards: Account[]
}

/** Summarize utilization when at least one card has a known limit. */
export function creditOf(accounts: Account[]): Credit | null {
	const cards = accounts.filter((account) => account.type === "credit")
	let used = 0
	let limit = 0
	for (const account of cards) {
		const cardLimit =
			account.creditLimit ??
			(account.available !== null && account.balance !== null
				? account.available + account.balance
				: null)
		if (!cardLimit) {
			continue
		}
		used += Math.max(0, account.balance ?? 0)
		limit += cardLimit
	}
	return limit > 0 ? { used, limit, util: used / limit, cards } : null
}

/** Tips when utilization is materially above the usual 30% guideline. */
export function creditTips(credit: Credit | null): Tip[] {
	if (!credit || credit.util < 0.3) {
		return []
	}
	const high = credit.util >= 0.7
	return [
		{
			id: `credit:${high ? "high" : "mid"}`,
			kind: high ? "warn" : "info",
			area: "credit",
			title: `You’re using ${formatPercent(credit.util)} of your credit`,
			body: `${formatMoney(credit.used)} owed on ${formatMoney(credit.limit)} of limits. Keeping it under 30% (${about(credit.limit * 0.3)}) helps your credit score; paying the card down before the statement date, not just by the due date, lowers the reported balance.`,
			// Opens the card with the most owing: the one to start paying down.
			action: (() => {
				const top = [...credit.cards].toSorted(
					(left, right) => (right.balance ?? 0) - (left.balance ?? 0)
				)[0]
				return top
					? {
							label:
								credit.cards.length === 1
									? "Open card"
									: `Open ${top.name}`,
							to: `/accounts/${top.id}`,
						}
					: undefined
			})(),
			priority: high ? 320 : 150,
		},
	]
}

/** One tip per account currently in overdraft or below zero. */
export function overdraftTips(accounts: Account[]): Tip[] {
	return accounts
		.filter(
			(account) =>
				account.type !== "credit" &&
				account.type !== "loan" &&
				((account.overdraftUsed ?? 0) > 0 || (account.balance ?? 0) < 0)
		)
		.map((account) => ({
			id: `overdraft:${account.id}`,
			kind: "warn" as const,
			area: "credit" as const,
			title: `${account.name} is in overdraft`,
			body: `You’re ${formatMoney(account.overdraftUsed || Math.abs(account.balance ?? 0))} below zero. Overdraft interest is usually around 20% a year plus a monthly fee, so this is one of the most expensive ways to borrow; topping it back up comes first.`,
			action: { label: "Open account", to: `/accounts/${account.id}` },
			priority: 360,
		}))
}

/** Bills due soon that your chequing balance wouldn't cover. */
export function upcomingTips(context: Ctx, subs: OwnSub[]): Tip[] {
	const until = addDays(context.today, 14)
	const chequing = context.accounts.filter(
		(account) => account.type === "chequing"
	)
	if (chequing.length === 0) {
		return []
	}
	const chequingIds = new Set(chequing.map((account) => account.id))
	// Only bills that come out of chequing (card ones go on the card).
	const due = subs.filter(
		(entry) =>
			entry.s.nextDue <= until &&
			(entry.s.accountId === null || chequingIds.has(entry.s.accountId))
	)
	const total = due.reduce((sum, entry) => sum + entry.price, 0)
	const cash = chequing.reduce(
		(sum, account) => sum + (account.available ?? account.balance ?? 0),
		0
	)
	if (total <= 0 || total <= cash) {
		return []
	}
	return [
		{
			id: `upcoming:${until}`,
			kind: "warn",
			area: "credit",
			title: "Upcoming bills are more than your chequing balance",
			body: `${plural(due.length, "payment")} totalling ${formatMoney(total)} ${due.length === 1 ? "is" : "are"} due in the next two weeks, and chequing has ${formatMoney(cash)}. Move money over or check when your next pay lands to avoid an overdraft or NSF fee.`,
			action: subsLink(
				"See what’s due",
				due.map((entry) => entry.s.id)
			),
			priority: 370,
		},
	]
}
