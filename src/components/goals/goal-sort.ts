import type { Goal } from "@/lib/api"

/** Sort order for goal status when urgency is equal. */
export const GOAL_STATUS_RANK = {
	overdue: 0,
	behind: 1,
	"on-track": 2,
	ahead: 3,
	"no-date": 4,
	done: 5,
} as const

const goalStatusRank = (goal: Goal) => GOAL_STATUS_RANK[goal.status]

/** Open goals first: most urgent (soonest deadline, then furthest behind) up top. */
export function byUrgency(leftGoal: Goal, rightGoal: Goal) {
	return (
		goalStatusRank(leftGoal) - goalStatusRank(rightGoal) ||
		(leftGoal.targetDate ?? "9999").localeCompare(
			rightGoal.targetDate ?? "9999"
		) ||
		leftGoal.progress - rightGoal.progress
	)
}

/** Spotlight strip: urgency then deadline. */
export function compareOpenGoals(leftGoal: Goal, rightGoal: Goal) {
	return (
		GOAL_STATUS_RANK[leftGoal.status] -
			GOAL_STATUS_RANK[rightGoal.status] ||
		(leftGoal.targetDate ?? "9999").localeCompare(
			rightGoal.targetDate ?? "9999"
		)
	)
}
