import { QueryError } from "@/components/ui/query-error"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatRelative, formatTimestamp } from "@/lib/format"
import {
	type NotificationItem,
	type NotificationKind,
	useClearAllNotifications,
	useDeleteNotification,
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
	useNotifications,
} from "@/lib/queries"
import { cn } from "cn"
import {
	Bell,
	CheckCircle2,
	CircleAlert,
	Info,
	Loader2,
	Trash2,
	TriangleAlert,
} from "lucide-react"
import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"

const KIND_META: Record<
	NotificationKind,
	{ icon: typeof Info; className: string }
> = {
	info: { icon: Info, className: "text-blue-600" },
	success: { icon: CheckCircle2, className: "text-green-600" },
	warning: { icon: TriangleAlert, className: "text-amber-600" },
	alert: { icon: CircleAlert, className: "text-destructive" },
}

function NotificationRow({
	item,
	busy,
	onOpen,
	onDelete,
}: {
	item: NotificationItem
	busy: boolean
	onOpen: (item: NotificationItem) => void
	onDelete: (id: string) => void
}) {
	const unread = !item.readAt
	const meta = KIND_META[item.kind]
	const Icon = meta.icon
	return (
		<div
			className={cn(
				"group flex gap-2 rounded-md border border-transparent px-2 py-2 transition-colors ",
				unread
					? "border-primary/25 bg-primary/10 hover:bg-primary/15"
					: "hover:bg-muted/60"
			)}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 gap-2 text-left"
				onClick={() => onOpen(item)}
			>
				<Icon
					className={cn("mt-0.5 size-4 shrink-0", meta.className)}
					aria-hidden
				/>
				<span className="min-w-0 flex-1">
					<span className="block truncate font-medium leading-snug">
						{item.title}
					</span>
					<span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
						{item.body}
					</span>
					<Tooltip>
						<TooltipTrigger
							render={
								<span className="mt-1 block text-[11px] text-muted-foreground underline decoration-muted-foreground/30 decoration-dotted underline-offset-2" />
							}
						>
							{formatRelative(item.createdAt)}
						</TooltipTrigger>
						<TooltipContent>{formatTimestamp(item.createdAt)}</TooltipContent>
					</Tooltip>
				</span>
			</button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-7 shrink-0 opacity-70 group-hover:opacity-100"
				aria-label={`Remove ${item.title}`}
				disabled={busy}
				onClick={() => onDelete(item.id)}
			>
				{busy ? (
					<Loader2 className="size-3.5 animate-spin" />
				) : (
					<Trash2 className="size-3.5" />
				)}
			</Button>
		</div>
	)
}

/** Header bell that lists in-app notifications. */
export function NotificationBell({ enabled }: { enabled: boolean }) {
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

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						className="relative"
						aria-label="Notifications"
					/>
				}
			>
				<Bell className="size-4" />
				{unread > 0 && (
					<Badge
						className="absolute -top-1 -right-1 h-4 min-w-4 border-2 border-background bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums hover:bg-red-500"
					>
						{unread > 99 ? "99+" : unread}
					</Badge>
				)}
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={6}
				className="w-[min(100vw-2rem,22rem)] gap-0 p-0"
			>
				<PopoverHeader className="flex-row items-center justify-between gap-2 border-b px-3 py-2">
					<PopoverTitle>Notifications</PopoverTitle>
					<div className="flex gap-1">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							disabled={busy || unread === 0}
							onClick={() => void markAll.mutate()}
						>
							Mark all read
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							disabled={busy || items.length === 0}
							onClick={() => void clearAll.mutate()}
						>
							Clear all
						</Button>
					</div>
				</PopoverHeader>
				<div className="max-h-[min(60vh,24rem)] overflow-y-auto px-1 py-1">
					{loading && !data && (
						<div className="grid gap-2 p-2">
							{[0, 1, 2].map((index) => (
								<Skeleton key={index} className="h-14 w-full" />
							))}
						</div>
					)}
					{error && !data && (
						<div className="p-3">
							<QueryError
								message={error.message}
								onRetry={() => void reload()}
							/>
						</div>
					)}
					{data && items.length === 0 && (
						<p className="px-3 py-8 text-center text-sm text-muted-foreground">
							You're all caught up.
						</p>
					)}
					{items.map((item) => (
						<NotificationRow
							key={item.id}
							item={item}
							busy={busy || deletingId === item.id}
							onOpen={(row) => void openItem(row)}
							onDelete={(id) => void deleteOne(id)}
						/>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}