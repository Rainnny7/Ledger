import type { Transaction } from "../api.ts"
import { addDays, parseIso } from "../format.ts"
import type { Tip, Ctx } from "./types.ts"
import {
	roundToWhole,
	formatMoney,
	about,
	plural,
	link,
	merchantsOf,
} from "./helpers.ts"

const FEE_KINDS: {
	key: string
	re: RegExp
	title: string
	advice: string
	priority: number
}[] = [
	{
		key: "overdraft",
		re: /\bnsf\b|overdraft|\bod\b|insufficient/i,
		title: "Overdraft and NSF charges",
		advice: "A small buffer in chequing, or a low-balance alert from your bank, usually stops these entirely.",
		priority: 290,
	},
	{
		key: "interest",
		re: /interest/i,
		title: "You’re paying interest",
		advice: "Card interest usually runs 20% or more. Paying the full statement balance each month, or moving the balance to a lower-rate option, makes it go away.",
		priority: 285,
	},
	{
		key: "foreign",
		re: /foreign|\bfx\b|conversion|intl|international|cross.?border/i,
		title: "Foreign transaction fees",
		advice: "A card with no foreign transaction fee would avoid the usual 2.5% on purchases in other currencies.",
		priority: 200,
	},
	{
		key: "atm",
		re: /\batm\b|\babm\b|withdrawal fee|network fee|interac fee/i,
		title: "ATM fees",
		advice: "Sticking to your own bank’s machines, or getting cash back at the till, avoids these.",
		priority: 190,
	},
	{
		key: "account",
		re: /plan fee|monthly fee|account fee|service charge|maintenance|monthly plan|annual fee/i,
		title: "Account and card fees",
		advice: "Many banks waive the monthly fee above a minimum balance, and there are good no-fee accounts and cards. A quick call asking for it to be waived works more often than you’d think.",
		priority: 220,
	},
]

/** Fee and interest charges grouped into advisor tips with annualized cost. */
export function feesOf(context: Ctx): { tips: Tip[]; yearly: number } {
	const from = addDays(context.today, -90)
	const span = Math.min(
		90,
		Math.max(
			30,
			-(
				parseIso(
					context.transactions.at(-1)?.date ?? context.today
				).getTime() - parseIso(context.today).getTime()
			) / 86_400_000
		)
	)
	const fees = context.transactions.filter(
		(transaction) =>
			transaction.date > from &&
			transaction.category === "fees" &&
			transaction.amount < 0
	)
	const total = fees.reduce((sum, transaction) => sum - transaction.amount, 0)
	const yearly = (total * 365) / span
	const groups = new Map<
		string,
		{
			kind: (typeof FEE_KINDS)[number]
			total: number
			count: number
			txs: Transaction[]
		}
	>()
	for (const transaction of fees) {
		const kind =
			FEE_KINDS.find(
				(feeKind) =>
					feeKind.re.test(transaction.description) ||
					feeKind.re.test(transaction.merchant)
			) ?? FEE_KINDS.at(-1)!
		const group = groups.get(kind.key) ?? {
			kind,
			total: 0,
			count: 0,
			txs: [],
		}
		group.total -= transaction.amount
		group.count++
		group.txs.push(transaction)
		groups.set(kind.key, group)
	}
	const tips: Tip[] = []
	for (const group of groups.values()) {
		if (group.total < 3) {
			continue
		}
		const yearlyEstimate = (group.total * 365) / span
		tips.push({
			id: `fees:${group.kind.key}:${context.thisMonth}`,
			kind:
				group.kind.key === "overdraft" || group.kind.key === "interest"
					? "warn"
					: "save",
			area: "fees",
			title: group.kind.title,
			body: `${plural(group.count, "charge")} totalling ${formatMoney(group.total)} in the last ${roundToWhole(span)} days, about ${about(yearlyEstimate)} a year. ${group.kind.advice}`,
			yearly: yearlyEstimate,
			action: {
				label: "See these fees",
				to: link("/accounts", {
					category: "fees",
					merchants: merchantsOf(group.txs),
					from: addDays(context.today, -89),
				}),
			},
			priority: group.kind.priority + Math.min(50, yearlyEstimate / 10),
		})
	}
	return { tips, yearly }
}
