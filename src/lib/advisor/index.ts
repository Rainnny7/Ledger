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

export function buildAdvice(input: AdvisorInput): AdvisorReport {
  const { today, transactions: txs } = input
  const thisMonth = monthOf(today)
  const earliest = txs.at(-1)?.date ?? today

  // The last three full months that the history actually covers (a few days' slack for the first).
  const months: string[] = []
  for (let i = 1; i <= 3; i++) {
    const m = prevMonth(thisMonth, i)
    if (earliest <= `${m}-05`) months.push(m)
  }
  const figures = months.map((m) => monthFigures(txs, m))
  const avg = (f: (m: MonthFigures) => number) =>
    figures.length
      ? figures.reduce((s, m) => s + f(m), 0) / figures.length
      : null
  const avgIncome = avg((m) => m.income)
  const avgOut = avg((m) => m.out)
  const hasIncome = avgIncome !== null && avgIncome >= 100
  const savingsRate =
    hasIncome && avgOut !== null ? (avgIncome - avgOut) / avgIncome : null
  const surplus = hasIncome && avgOut !== null ? avgIncome - avgOut : null

  const ctx: Ctx = {
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

  const cushion = cushionOf(ctx)
  const credit = creditOf(input.accounts)
  const fees = feesOf(ctx)
  const subs = ownSubscriptions(input)
  const subscriptionsYearly = subs.reduce((s, x) => s + x.yearly, 0)

  const tips: Tip[] = [
    ...paceTips(ctx),
    ...habitTips(ctx),
    ...diningTips(ctx),
    ...weekendTips(ctx),
    ...subscriptionTips(ctx, subs, subscriptionsYearly),
    ...fees.tips,
    ...savingsTips(ctx),
    ...cushionTips(ctx, cushion),
    ...creditTips(credit),
    ...overdraftTips(input.accounts),
    ...upcomingTips(ctx, subs),
    ...goalTips(ctx),
  ]
  tips.sort((a, b) => b.priority - a.priority)

  const potentialYearly = tips.reduce(
    (s, t) => s + (t.kind !== "win" && t.yearly ? t.yearly : 0),
    0
  )

  return {
    tips,
    health: healthOf(ctx, cushion, credit, fees.yearly),
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
