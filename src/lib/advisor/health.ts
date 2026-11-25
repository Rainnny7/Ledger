import type { HealthFactor, Health, Ctx } from "./types"
import { about, pct, plural, clamp01 } from "./helpers"
import type { Cushion } from "./savings"
import type { Credit } from "./credit"

export function healthOf(
  ctx: Ctx,
  cushion: Cushion | null,
  credit: Credit | null,
  feesYearly: number
): Health | null {
  if (ctx.savingsRate === null) return null
  const factors: HealthFactor[] = []
  const rate = ctx.savingsRate
  factors.push({
    key: "saving",
    label: "Saving rate",
    max: 30,
    score: 30 * clamp01(rate / 0.2),
    detail: `${pct(rate)} of income kept (20%+ scores full marks)`,
  })
  const positive = ctx.figures.filter((m) => m.net >= 0).length
  factors.push({
    key: "balance",
    label: "Living within income",
    max: 15,
    score: (15 * positive) / ctx.figures.length,
    detail: `${positive} of the last ${plural(ctx.figures.length, "month")} ended ahead`,
  })
  if (cushion) {
    const m = cushion.months
    factors.push({
      key: "cushion",
      label: "Cash cushion",
      max: 25,
      score: 20 * clamp01(m / 3) + 5 * clamp01((m - 3) / 3),
      detail: `${m.toFixed(1)} months of spending in the bank (6+ scores full marks)`,
    })
  }
  factors.push({
    key: "credit",
    label: "Credit use",
    max: 15,
    score: !credit
      ? 15
      : credit.util <= 0.1
        ? 15
        : credit.util <= 0.3
          ? 12
          : credit.util <= 0.5
            ? 7
            : credit.util <= 0.75
              ? 3
              : 0,
    detail: credit
      ? `${pct(credit.util)} of your credit limits in use`
      : "No credit cards linked",
  })
  factors.push({
    key: "fees",
    label: "Fees & interest",
    max: 15,
    score:
      feesYearly < 1
        ? 15
        : feesYearly < 50
          ? 11
          : feesYearly < 150
            ? 6
            : feesYearly < 300
              ? 3
              : 0,
    detail:
      feesYearly < 1
        ? "No fees lately"
        : `About ${about(feesYearly)} a year at your recent rate`,
  })
  const max = factors.reduce((s, f) => s + f.max, 0)
  const score = Math.round(
    (factors.reduce((s, f) => s + f.score, 0) / max) * 100
  )
  return {
    score,
    label:
      score >= 80
        ? "Excellent"
        : score >= 65
          ? "Good"
          : score >= 45
            ? "Fair"
            : "Needs attention",
    factors: factors.map((f) => ({
      ...f,
      score: Math.round(f.score * 10) / 10,
    })),
  }
}
