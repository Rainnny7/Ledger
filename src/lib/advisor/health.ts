import type { HealthFactor, Health, Ctx } from "./types"
import { about, formatPercent, plural, clampToUnit } from "./helpers"
import type { Cushion } from "./savings"
import type { Credit } from "./credit"

/** `healthOf` for this feature area. */
export function healthOf(
	context: Ctx,
	cushion: Cushion | null,
	credit: Credit | null,
	feesYearly: number
): Health | null {
	if (context.savingsRate === null) {
		return null
	}
	const factors: HealthFactor[] = []
	const rate = context.savingsRate
	factors.push({
		key: "saving",
		label: "Saving rate",
		max: 30,
		score: 30 * clampToUnit(rate / 0.2),
		detail: `${formatPercent(rate)} of income kept (20%+ scores full marks)`,
	})
	const positive = context.figures.filter((figure) => figure.net >= 0).length
	factors.push({
		key: "balance",
		label: "Living within income",
		max: 15,
		score: (15 * positive) / context.figures.length,
		detail: `${positive} of the last ${plural(context.figures.length, "month")} ended ahead`,
	})
	if (cushion) {
		const cushionMonths = cushion.months
		factors.push({
			key: "cushion",
			label: "Cash cushion",
			max: 25,
			score:
				20 * clampToUnit(cushionMonths / 3) +
				5 * clampToUnit((cushionMonths - 3) / 3),
			detail: `${cushionMonths.toFixed(1)} months of spending in the bank (6+ scores full marks)`,
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
			? `${formatPercent(credit.util)} of your credit limits in use`
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
	const max = factors.reduce((sum, factor) => sum + factor.max, 0)
	const score = Math.round(
		(factors.reduce((sum, factor) => sum + factor.score, 0) / max) * 100
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
		factors: factors.map((factor) => ({
			...factor,
			score: Math.round(factor.score * 10) / 10,
		})),
	}
}
