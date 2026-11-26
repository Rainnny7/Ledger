import { roundMoney } from "@ledger/shared/money"
import {
	financialOverviewForUser,
	getGoalsForUser,
	getSubscriptionsForUser,
	searchTransactionsForUser,
	spendingSummaryForUser,
} from "../src/chat/tools.ts"
import { todayIso } from "../src/time/today.ts"

export type ChatQualityCheck = {
	/** Amounts the answer should mention; empty means skip check. */
	expectedFigures: number[]
	/** When true, PASS if any one figure matches (e.g. food vs groceries wording). */
	matchAnyFigure?: boolean
}

function monthBounds(reference: string) {
	const [year, month] = reference.split("-").map(Number)
	const from = `${year}-${String(month).padStart(2, "0")}-01`
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
	const until = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
	return { from, until }
}

function previousMonthReference(reference: string) {
	const [year, month] = reference.split("-").map(Number)
	const date = new Date(Date.UTC(year, month - 2, 1))
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Flexible match for currency figures in model prose (comma or plain decimals). */
export function answerContainsFigure(
	text: string,
	expected: number,
	relativeTolerance = 0.015
): boolean {
	const target = Math.abs(expected)
	const pattern = /\$?\s*([\d,]+(?:\.\d{1,2})?)/g
	for (const match of text.matchAll(pattern)) {
		const parsed = Number.parseFloat(match[1].replace(/,/g, ""))
		if (!Number.isFinite(parsed)) {
			continue
		}
		const delta = Math.abs(parsed - target)
		if (delta <= Math.max(0.02, target * relativeTolerance)) {
			return true
		}
	}
	return false
}

/** Expected numeric answers for benchmark questions, derived from the seeded bench database. */
export function benchChatQualityChecks(
	userId: string
): (ChatQualityCheck | null)[] {
	const today = todayIso()
	const currentRef = today.slice(0, 7)
	const previousRef = previousMonthReference(currentRef)
	const previousMonth = monthBounds(previousRef)
	const yearStart = `${today.slice(0, 4)}-01-01`

	const lastMonthFood = spendingSummaryForUser(userId, {
		from: previousMonth.from,
		until: previousMonth.until,
		groupBy: "category",
	})
	const foodGroups = (
		lastMonthFood.groups as { key: string; spending: number }[]
	).filter((group) => group.key === "food" || group.key === "groceries")
	const foodLike = foodGroups.reduce((sum, group) => sum + group.spending, 0)

	const overview = financialOverviewForUser(userId)
	const incomeThisMonth = Number(
		(overview.currentMonth as { incomeTotal: number }).incomeTotal
	)

	const subscriptions = getSubscriptionsForUser(userId)
	const monthlySubTotal = Number(subscriptions.monthlyTotal)

	const ninetyDaysFrom = new Date(today)
	ninetyDaysFrom.setUTCDate(ninetyDaysFrom.getUTCDate() - 90)
	const largest = searchTransactionsForUser(userId, {
		from: ninetyDaysFrom.toISOString().slice(0, 10),
		until: today,
		type: "spending",
		sort: "amount",
		limit: 1,
	})
	const biggestPurchase = Math.abs(
		Number(
			(largest.transactions as { amount: number }[] | undefined)?.[0]
				?.amount ?? 0
		)
	)

	const overBudget = (
		overview.budgetStatus as {
			over: boolean
			spent: number
			limit: number
		}[]
	).filter((row) => row.over)

	const yearSummary = spendingSummaryForUser(userId, {
		from: yearStart,
		until: today,
		groupBy: "category",
	})
	const yearSpending = Number(yearSummary.spendingTotal)

	const goals = getGoalsForUser(userId)
	const goalSaved = Number(
		(goals.goals as { saved: number }[] | undefined)?.[0]?.saved ?? 0
	)

	return [
		foodLike > 0
			? {
					expectedFigures: [
						...new Set([
							roundMoney(foodLike),
							...foodGroups.map((group) =>
								roundMoney(group.spending)
							),
						]),
					],
					matchAnyFigure: true,
				}
			: null,
		{
			expectedFigures: [
				monthlySubTotal,
				Number(
					(subscriptions.subscriptions as { amount: number }[])[0]
						?.amount ?? 0
				),
			],
		},
		overBudget.length > 0
			? {
					expectedFigures: overBudget.map((row) =>
						roundMoney(row.spent)
					),
				}
			: null,
		null,
		biggestPurchase > 0
			? { expectedFigures: [roundMoney(biggestPurchase)] }
			: null,
		{ expectedFigures: [roundMoney(incomeThisMonth)] },
		(() => {
			const recent = searchTransactionsForUser(userId, {
				merchant: "netflix",
				sort: "date",
				limit: 5,
			})
			const first = (
				recent.transactions as { amount: number }[] | undefined
			)?.[0]
			return first
				? {
						expectedFigures: [
							roundMoney(Math.abs(first.amount)),
							roundMoney(Number(recent.totalSpending)),
						],
						matchAnyFigure: true,
					}
				: null
		})(),
		goalSaved > 0 ? { expectedFigures: [roundMoney(goalSaved)] } : null,
		{ expectedFigures: [roundMoney(yearSpending)] },
		{
			expectedFigures: [
				roundMoney(incomeThisMonth),
				Number(
					(overview.currentMonth as { spendingTotal: number })
						.spendingTotal
				),
			],
		},
	]
}

/** PASS when every expected figure appears in the assistant answer. */
export function gradeChatAnswer(
	text: string,
	check: ChatQualityCheck | null
): "PASS" | "SKIP" | "FAIL" {
	if (!check || check.expectedFigures.length === 0) {
		return "SKIP"
	}
	if (check.matchAnyFigure) {
		return check.expectedFigures.some((figure) =>
			answerContainsFigure(text, figure)
		)
			? "PASS"
			: "FAIL"
	}
	const missing = check.expectedFigures.filter(
		(figure) => !answerContainsFigure(text, figure)
	)
	return missing.length === 0 ? "PASS" : "FAIL"
}
