import { formatMonth } from "../format.ts"
import type { Tip, Ctx } from "./types.ts"
import {
	roundToWhole,
	formatMoney,
	about,
	formatPercent,
	plural,
	link,
	monthOf,
} from "./helpers.ts"

/** `savingsTips` for this feature area. */
export function savingsTips(context: Ctx): Tip[] {
	const { savingsRate: rate, avgIncome, avgOut, figures } = context
	if (rate === null || avgIncome === null || avgOut === null) {
		return []
	}
	const span = `the last ${plural(figures.length, "full month")}`
	const tips: Tip[] = []
	const negative = figures.filter(
		(figure) => figure.income > 0 && figure.net < 0
	)

	if (rate < 0) {
		tips.push({
			id: `saving:negative:${context.months[0]}`,
			kind: "warn",
			area: "savings",
			title: "You’re spending more than you earn",
			body: `Over ${span} you brought in ${formatMoney(avgIncome)} a month on average and spent ${formatMoney(avgOut)}, a gap of ${formatMoney(avgOut - avgIncome)} a month. Start with the biggest category on the Insights page and look for one thing to cut back.`,
			action: {
				label: "See cash flow",
				to: link("/insights", { range: "6m" }),
			},
			priority: 380,
		})
	} else if (rate < 0.1) {
		const need = avgIncome * 0.1 - (avgIncome - avgOut)
		tips.push({
			id: `saving:low:${context.months[0]}`,
			kind: "save",
			area: "savings",
			title: `You’re keeping ${formatPercent(rate)} of your income`,
			body: `A common first target is 10%. Over ${span} that would have meant spending about ${about(need)} less a month. Setting up an automatic transfer on payday makes it happen before you can spend it.`,
			action: {
				label: "See cash flow",
				to: link("/insights", { range: "6m" }),
			},
			priority: 240,
		})
	} else if (rate >= 0.2) {
		tips.push({
			id: `saving:great:${context.months[0]}`,
			kind: "win",
			area: "savings",
			title: `You’re keeping ${formatPercent(rate)} of your income`,
			body: `Over ${span} you averaged ${formatMoney(avgIncome - avgOut)} a month left over after spending. That’s above the 20% many planners aim for. Make sure it’s going somewhere useful: a goal, savings, or investments.`,
			action: { label: "Open goals", to: "/goals" },
			priority: 30,
		})
	}

	if (negative.length >= 2 && rate >= 0) {
		tips.push({
			id: `saving:uneven:${context.months[0]}`,
			kind: "info",
			area: "savings",
			title: `You overspent in ${plural(negative.length, "month")} recently`,
			body: `${negative.map((figure) => formatMonth(figure.month, "long")).join(" and ")} went out more than came in, even though you’re ahead on average. A small monthly buffer smooths out the expensive months.`,
			priority: 140,
		})
	}

	// A regular move of money into savings is the habit that matters most.
	const savingsIds = new Set(
		context.accounts
			.filter(
				(account) =>
					account.type === "savings" || account.type === "investment"
			)
			.map((account) => account.id)
	)
	if (savingsIds.size > 0) {
		const perMonth = context.months.map((monthKey) =>
			context.transactions
				.filter(
					(transaction) =>
						savingsIds.has(transaction.accountId) &&
						monthOf(transaction.date) === monthKey &&
						transaction.category === "transfers" &&
						transaction.amount > 0
				)
				.reduce((sum, payment) => sum + payment.amount, 0)
		)
		const regular = perMonth.filter((amount) => amount > 0).length
		if (context.months.length >= 2 && regular === context.months.length) {
			const avg =
				perMonth.reduce((sum, v) => sum + v, 0) / perMonth.length
			tips.push({
				id: `saving:habit:${context.months[0]}`,
				kind: "win",
				area: "savings",
				title: "You move money into savings every month",
				body: `About ${about(avg)} a month on average. Paying yourself first like this is the habit that matters most${context.surplus !== null && context.surplus > avg * 0.5 ? `; with ${about(context.surplus)} a month to spare, you could raise it` : ""}.`,
				priority: 20,
			})
		} else if (
			regular === 0 &&
			context.surplus !== null &&
			context.surplus > 100
		) {
			tips.push({
				id: `saving:automate:${context.months[0]}`,
				kind: "save",
				area: "savings",
				title: "Automate a transfer to savings",
				body: `You have ${about(context.surplus)} a month left over on average, but none of it is moving into savings. A transfer scheduled for the day after payday, even a small one, makes saving the default.`,
				priority: 200,
			})
		}
	}
	return tips
}

/** `Cushion` type used in this module. */
export interface Cushion {
	cash: number
	months: number
	chequing: number
}

/** `cushionOf` for this feature area. */
export function cushionOf(context: Ctx): Cushion | null {
	if (context.avgOut === null || context.avgOut < 100) {
		return null
	}
	const liquid = context.accounts.filter(
		(account) =>
			account.type === "chequing" ||
			account.type === "savings" ||
			account.type === "wallet"
	)
	if (liquid.length === 0) {
		return null
	}
	const cash = liquid.reduce(
		(sum, account) => sum + Math.max(0, account.balance ?? 0),
		0
	)
	const chequing = liquid
		.filter((account) => account.type === "chequing")
		.reduce((sum, account) => sum + Math.max(0, account.balance ?? 0), 0)
	return { cash, chequing, months: cash / context.avgOut }
}

const EMERGENCY = /emergency|rainy|cushion|buffer|safety/i

/** `cushionTips` for this feature area. */
export function cushionTips(context: Ctx, c: Cushion | null): Tip[] {
	if (!c || context.avgOut === null) {
		return []
	}
	const goal = context.goals.find(
		(candidate) => !candidate.archived && EMERGENCY.test(candidate.name)
	)
	const action = goal
		? { label: "Open goal", to: link("/goals", { focus: goal.id }) }
		: { label: "Start a goal", to: "/goals" }
	const target = context.avgOut * 3
	const tips: Tip[] = []
	if (c.months < 1) {
		tips.push({
			id: `cushion:thin:${context.thisMonth}`,
			kind: "warn",
			area: "savings",
			title: "Your cash cushion is thin",
			body: `Your chequing and savings hold ${formatMoney(c.cash)}, less than one month of your usual spending (${formatMoney(context.avgOut)}). Aim for one month first, then three; it’s what keeps a surprise bill off a credit card.${goal ? "" : " An emergency fund goal will track it for you."}`,
			action,
			priority: 330,
		})
	} else if (c.months < 3) {
		const perMonth = (target - c.cash) / 12
		tips.push({
			id: `cushion:build:${context.thisMonth}`,
			kind: "info",
			area: "savings",
			title: `Your cash covers ${c.months.toFixed(1)} months of spending`,
			body: `Three months (about ${about(target)}) is a common emergency fund target. Putting aside ${about(perMonth)} a month would get you there in a year.`,
			action,
			priority: 160,
		})
	} else if (c.months >= 6) {
		tips.push({
			id: `cushion:solid:${context.thisMonth}`,
			kind: "win",
			area: "savings",
			title: `${roundToWhole(c.months)} months of spending in the bank`,
			body: "That’s a solid emergency fund. Anything well beyond six months could be working harder in a goal or invested.",
			priority: 15,
		})
	}

	// Money parked in chequing beyond what a month needs could be earning something.
	const idle = c.chequing - context.avgOut * 1.5
	if (idle >= 1000) {
		const yearly = idle * 0.03
		tips.push({
			id: `cushion:idle:${context.thisMonth}`,
			kind: "save",
			area: "savings",
			title: `About ${about(idle)} is sitting idle in chequing`,
			body: `That’s more than a month and a half of spending on top of what you need. In a high-interest savings account at around 3% it would earn roughly ${about(yearly)} a year, and still be there when you need it.`,
			yearly,
			priority: 175,
		})
	}
	return tips
}
