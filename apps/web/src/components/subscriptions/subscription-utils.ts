import type { Subscription } from "@/lib/api"
import { daysFromToday, formatRelativeDate } from "@/lib/format"
import { shiftCycle } from "@/lib/cycles"

/** Every billing date of `subscription` between from..to (inclusive), anchored on its next due date. */
export function subscriptionOccurrences(
	subscription: Subscription,
	from: string,
	to: string
) {
	const out: string[] = []
	const floor =
		subscription.anchorDate < from ? from : subscription.anchorDate
	for (let cycleOffset = -60; cycleOffset <= 60; cycleOffset++) {
		const occurrenceDate = shiftCycle(
			subscription.nextDue,
			subscription.cycle,
			cycleOffset
		)
		if (occurrenceDate > to) {
			break
		}
		if (occurrenceDate >= from && occurrenceDate >= floor) {
			out.push(occurrenceDate)
		}
	}
	return out
}

/** Friendly due label: Today, Tomorrow, or a relative date. */
export function subscriptionDueLabel(iso: string) {
	const days = daysFromToday(iso)
	if (days === 0) {
		return "Today"
	}
	if (days === 1) {
		return "Tomorrow"
	}
	return formatRelativeDate(iso)
}
