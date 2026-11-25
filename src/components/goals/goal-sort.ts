import type { Goal } from "@/lib/api"

export const GOAL_STATUS_RANK = {
  overdue: 0,
  behind: 1,
  "on-track": 2,
  ahead: 3,
  "no-date": 4,
  done: 5,
} as const

const goalStatusRank = (g: Goal) => GOAL_STATUS_RANK[g.status]

/** Open goals first: most urgent (soonest deadline, then furthest behind) up top. */
export function byUrgency(a: Goal, b: Goal) {
  return (
    goalStatusRank(a) - goalStatusRank(b) ||
    (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") ||
    a.progress - b.progress
  )
}

/** Spotlight strip: urgency then deadline. */
export function compareOpenGoals(a: Goal, b: Goal) {
  return (
    GOAL_STATUS_RANK[a.status] - GOAL_STATUS_RANK[b.status] ||
    (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999")
  )
}
