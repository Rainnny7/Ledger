import { isoDate } from "@/lib/format"
import type { NotificationItem } from "@/lib/queries"

/** Sticky heading buckets for the notification list. */
export type NotificationDayGroup = "today" | "yesterday" | "earlier"

const GROUP_LABEL: Record<NotificationDayGroup, string> = {
	today: "Today",
	yesterday: "Yesterday",
	earlier: "Earlier",
}

/** Returns the day bucket for one notification timestamp. */
export function notificationDayGroup(createdAt: string): NotificationDayGroup {
	const created = isoDate(new Date(createdAt))
	const today = isoDate(new Date())
	if (created === today) {
		return "today"
	}
	const yesterday = isoDate(
		new Date(Date.now() - 24 * 60 * 60 * 1000)
	)
	if (created === yesterday) {
		return "yesterday"
	}
	return "earlier"
}

export interface GroupedNotifications {
	group: NotificationDayGroup
	label: string
	items: NotificationItem[]
}

/** Groups items under Today, Yesterday, and Earlier (order preserved within each). */
export function groupNotificationsByDay(
	items: NotificationItem[]
): GroupedNotifications[] {
	const buckets: Record<NotificationDayGroup, NotificationItem[]> = {
		today: [],
		yesterday: [],
		earlier: [],
	}
	for (const item of items) {
		buckets[notificationDayGroup(item.createdAt)].push(item)
	}
	return (["today", "yesterday", "earlier"] as const)
		.filter((group) => buckets[group].length > 0)
		.map((group) => ({
			group,
			label: GROUP_LABEL[group],
			items: buckets[group],
		}))
}