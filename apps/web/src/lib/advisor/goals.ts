import { formatShortDate } from "../format.ts"
import type { Tip, Ctx } from "./types.ts"
import { formatMoney, about, link } from "./helpers.ts"

/** Tips when goals are behind, ahead, or when surplus could fund a new goal. */
export function goalTips(context: Ctx): Tip[] {
	const open = context.goals.filter(
		(goal) =>
			!goal.archived && goal.status !== "done" && goal.access !== "view"
	)
	const tips: Tip[] = []
	const behind = open.filter(
		(goal) => goal.status === "behind" || goal.status === "overdue"
	)
	for (const goal of behind.slice(0, 2)) {
		const need =
			goal.neededPerMonth !== null
				? context.toHome(goal.neededPerMonth, goal.currency)
				: null
		const pace = context.toHome(goal.pacePerMonth, goal.currency)
		const verb = goal.kind === "payoff" ? "pay" : "put in"
		const fits =
			need !== null && context.surplus !== null && context.surplus >= need
		tips.push({
			id: `goal:${goal.id}:${goal.status}:${context.thisMonth}`,
			kind: "warn",
			area: "goals",
			title:
				goal.status === "overdue"
					? `${goal.name} is past its target date`
					: `${goal.name} is falling behind`,
			body:
				goal.status === "overdue"
					? `${formatMoney(context.toHome(goal.remaining, goal.currency))} is still to go. Pick a new date you can hit so the monthly amount is realistic again.`
					: `To finish on time you’d need to ${verb} ${formatMoney(need ?? 0)} a month; lately it’s been ${formatMoney(pace)}.` +
						(fits
							? ` Your average monthly surplus of ${about(context.surplus!)} would cover it.`
							: " Pushing the date out a little, or a small automatic transfer, gets it back on track."),
			action: {
				label: "Open goal",
				to: link("/goals", { focus: goal.id }),
			},
			priority: 250,
		})
	}

	if (
		open.length === 0 &&
		context.surplus !== null &&
		context.surplus >= 150
	) {
		tips.push({
			id: `goal:none:${context.months[0]}`,
			kind: "info",
			area: "goals",
			title: "Give your surplus a job",
			body: `You’re ahead by about ${about(context.surplus)} a month. Naming what it’s for (a trip, an emergency fund, paying off a card) and setting a date makes it far more likely to stick around.`,
			action: { label: "Create a goal", to: "/goals" },
			priority: 130,
		})
	}

	const ahead = open.filter((goal) => goal.status === "ahead")
	if (ahead.length > 0) {
		tips.push({
			id: `goal:ahead:${ahead
				.map((goal) => goal.id)
				.toSorted()
				.join(",")}:${context.thisMonth}`,
			kind: "win",
			area: "goals",
			title:
				ahead.length === 1
					? `${ahead[0].name} is ahead of schedule`
					: `${ahead.length} goals are ahead of schedule`,
			body: ahead
				.slice(0, 3)
				.map((goal) =>
					goal.projectedDate
						? `${goal.name} should be done by ${formatShortDate(goal.projectedDate)}`
						: `${goal.name} is ahead`
				)
				.join("; ")
				.concat("."),
			action: {
				label: ahead.length === 1 ? "Open goal" : "Open goals",
				to: link("/goals", {
					focus: ahead.map((goal) => goal.id).join(","),
				}),
			},
			priority: 25,
		})
	}
	return tips
}
