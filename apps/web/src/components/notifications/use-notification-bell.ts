import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
	type NotificationItem,
	useClearAllNotifications,
	useDeleteNotification,
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
	useNotifications,
} from "@/lib/queries"

/**
 * Notification bell popover state and mutation handlers.
 */
export function useNotificationBell(enabled: boolean) {
	const navigate = useNavigate()
	const { data, loading, error, reload } = useNotifications(enabled)
	const markRead = useMarkNotificationRead()
	const markAll = useMarkAllNotificationsRead()
	const remove = useDeleteNotification()
	const clearAll = useClearAllNotifications()
	const [open, setOpen] = useState(false)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	const unread = data?.unreadCount ?? 0
	const items = data?.items ?? []
	const busy =
		markRead.isPending ||
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
		}
	}

	async function deleteOne(id: string) {
		setDeletingId(id)
		try {
			await remove.mutateAsync(id)
		} finally {
			setDeletingId(null)
		}
	}

	return {
		open,
		setOpen,
		unread,
		items,
		busy,
		loading,
		data,
		error,
		reload,
		markAll,
		clearAll,
		openItem,
		deleteOne,
		deletingId,
	}
}
