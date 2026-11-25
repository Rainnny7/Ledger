import type { Subscription } from "@/lib/api"
import { daysFromToday, formatRelativeDate } from "@/lib/format"
import { shiftCycle } from "@/lib/cycles"

/** Every billing date of `s` between from..to (inclusive), anchored on its next due date. */
export function subscriptionOccurrences(
  s: Subscription,
  from: string,
  to: string
) {
  const out: string[] = []
  const floor = s.anchorDate < from ? from : s.anchorDate
  for (let n = -60; n <= 60; n++) {
    const d = shiftCycle(s.nextDue, s.cycle, n)
    if (d > to) break
    if (d >= from && d >= floor) out.push(d)
  }
  return out
}

export function subscriptionDueLabel(iso: string) {
  const days = daysFromToday(iso)
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  return formatRelativeDate(iso)
}
