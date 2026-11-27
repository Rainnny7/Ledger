import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { confirmDialog } from "@/lib/confirm"
import {
	type NotificationItem,
	useClearAllNotifications,
	useDeleteNotification,
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
	useMarkNotificationUnread,
	useNotifications,
} from "@/lib/queries"

export type NotificationBellTab = "all" | "unread"

/**
 * Notification bell popover state, filtered list, and mutation handlers.
 */
export function useNotificationBell(enabled: boolean) {
	const navigate = useNavigate()
	const { data, loading, error, reload } = useNotifications(enabled)
	const markRead = useMarkNotificationRead()
	const markUnread = useMarkNotificationUnread()
	const markAll = useMarkAllNotificationsRead()
	const remove = useDeleteNotification()
	const clearAll = useClearAllNotifications()
	const [open, setOpen] = useState(false)
	const [tab, setTab] = useState<NotificationBellTab>("all")
	const [expandedId, setExpandedId] = useState<string | null>(null)
	const [actionId, setActionId] = useState<string | null>(null)
	const [exitPending, setExitPending] = useState(0)
	const unread = data?.unreadCount ?? 0
	const items = data?.items
	const filtered = useMemo(() => {
		const rows = items ?? []
		return tab === "unread" ? rows.filter((item) => !item.readAt) : rows
	}, [items, tab])
	const listHasRows = (items?.length ?? 0) > 0 || exitPending > 0
	const unreadListHasRows = filtered.length > 0 || exitPending > 0
	const finishExit = useCallback((_id: string) => {
		setExitPending((count) => Math.max(0, count - 1))
	}, [])
	const busy =
		markRead.isPending ||
		markUnread.isPending ||
		markAll.isPending ||
		remove.isPending ||
		clearAll.isPending

	async function openItem(item: NotificationItem) {
		if (!item.readAt) {
			await markRead.mutateAsync(item.id)
		}
		if (item.href) {
			setOpen(false)
			void navigate({ href: item.href })
			return
		}
		setExpandedId((current) => (current === item.id ? null : item.id))
	}

	async function toggleRead(item: NotificationItem) {
		setActionId(item.id)
		try {
			if (item.readAt) {
				await markUnread.mutateAsync(item.id)
			} else {
				await markRead.mutateAsync(item.id)
			}
		} finally {
			setActionId(null)
		}
	}

	async function deleteOne(id: string) {
		setExitPending((count) => count + 1)
		setActionId(id)
		try {
			await remove.mutateAsync(id)
			if (expandedId === id) {
				setExpandedId(null)
			}
		} finally {
			setActionId(null)
		}
	}

	async function confirmClearAll() {
		if (!items?.length) {
			return
		}
		const ok = await confirmDialog({
			title: "Clear all notifications?",
			description: "This removes every notification from your inbox.",
			action: "Clear all",
			destructive: true,
		})
		if (ok) {
			const clearing = items?.length ?? 0
			setExitPending((count) => count + clearing)
			await clearAll.mutateAsync()
		}
	}

	function openNotificationSettings() {
		setOpen(false)
		void navigate({
			to: "/",
			search: (previous) => ({ ...previous, settings: "notifications" }),
		})
	}

	return {
		open,
		setOpen,
		tab,
		setTab,
		unread,
		items,
		filtered,
		listHasRows,
		unreadListHasRows,
		finishExit,
		busy,
		loading,
		data,
		error,
		reload,
		markAll,
		clearAll,
		openItem,
		toggleRead,
		deleteOne,
		confirmClearAll,
		openNotificationSettings,
		expandedId,
		actionId,
	}
}
