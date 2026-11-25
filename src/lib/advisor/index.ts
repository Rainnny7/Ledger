/**
 * The Advisor: reads your transactions, subscriptions, goals and balances and turns them into a
 * short list of tips (where you're overspending, subscriptions worth a second look, fees you could
 * avoid, how big your cushion is) plus an overall "money health" score.
 *
 * Everything here is a pure function of data the app already has, so it runs in the browser and
 * works the same in demo mode. Amounts are expected in the home currency (see inHomeCurrency).
 */
import type {
	Tip,
	AdvisorReport,
	AdvisorInput,
	MonthFigures,
	Ctx,
} from "./types"
import { monthOf, prevMonth, monthFigures } from "./helpers"
import { ownSubscriptions } from "./subscriptions"
import { feesOf } from "./fees"
import { cushionOf } from "./savings"
import { creditOf } from "./credit"
import { healthOf } from "./health"
import { paceTips, habitTips, diningTips, weekendTips } from "./spending"
import { subscriptionTips } from "./subscriptions"
import { savingsTips, cushionTips } from "./savings"
import { creditTips, overdraftTips, upcomingTips } from "./credit"
import { goalTips } from "./goals"

/** Re-exported advisor types for consumers. */
export type {
	AdvisorInput,
	AdvisorReport,
	AdvisorSummary,
	Health,
	HealthFactor,
	Tip,
	TipArea,
	TipKind,
} from "./types"

/** `buildAdvice` for this feature area. */
export function buildAdvice(input: AdvisorInput): AdvisorReport {
	const { today, transactions: txs } = input
	const thisMonth = monthOf(today)
	const earliest = txs.at(-1)?.date ?? today

	// The last three full months that the history actually covers (a few days' slack for the first).
	const months: string[] = []
	for (let i = 1; i <= 3; i++) {
		const monthKey = prevMonth(thisMonth, i)
		if (earliest <= `${monthKey}-05`) {
			months.push(monthKey)
		}
	}
	const figures = months.map((monthKey) => monthFigures(txs, monthKey))
	const avg = (pick: (figure: MonthFigures) => number) =>
		figures.length
			? figures.reduce((sum, figure) => sum + pick(figure), 0) /
				figures.length
			: null
	const avgIncome = avg((figure) => figure.income)
	const avgOut = avg((figure) => figure.out)
	const hasIncome = avgIncome !== null && avgIncome >= 100
	const savingsRate =
		hasIncome && avgOut !== null ? (avgIncome - avgOut) / avgIncome : null
	const surplus = hasIncome && avgOut !== null ? avgIncome - avgOut : null

	const context: Ctx = {
		...input,
		thisMonth,
		months,
		figures,
		avgIncome,
		avgOut,
		hasIncome,
		savingsRate,
		surplus,
	}

	const cushion = cushionOf(context)
	const credit = creditOf(input.accounts)
	const fees = feesOf(context)
	const subs = ownSubscriptions(input)
	const subscriptionsYearly = subs.reduce((sum, x) => sum + x.yearly, 0)

	const tips: Tip[] = [
		...paceTips(context),
		...habitTips(context),
		...diningTips(context),
		...weekendTips(context),
		...subscriptionTips(context, subs, subscriptionsYearly),
		...fees.tips,
		...savingsTips(context),
		...cushionTips(context, cushion),
		...creditTips(credit),
		...overdraftTips(input.accounts),
		...upcomingTips(context, subs),
		...goalTips(context),
	]
	tips.sort((left, right) => right.priority - left.priority)

	const potentialYearly = tips.reduce(
		(sum, tip) => sum + (tip.kind !== "win" && tip.yearly ? tip.yearly : 0),
		0
	)

	return {
		tips,
		health: healthOf(context, cushion, credit, fees.yearly),
		summary: {
			savingsRate,
			avgIncome: hasIncome ? avgIncome : null,
			avgOut,
			cushionMonths: cushion?.months ?? null,
			subscriptionsYearly,
			potentialYearly,
			months,
		},
	}
}
