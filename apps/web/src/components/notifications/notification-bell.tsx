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
import { NotificationBellRow } from "@/components/notifications/notification-bell-row"
import { useNotificationBell } from "@/components/notifications/use-notification-bell"
import { Bell } from "lucide-react"

/** Header bell that lists in-app notifications. */
export function NotificationBell({ enabled }: { enabled: boolean }) {
	const bell = useNotificationBell(enabled)

	return (
		<Popover open={bell.open} onOpenChange={bell.setOpen}>
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
				{bell.unread > 0 && (
					<Badge className="absolute -top-1 -right-1 h-4 min-w-4 border-2 border-background bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums hover:bg-red-500">
						{bell.unread > 99 ? "99+" : bell.unread}
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
							disabled={bell.busy || bell.unread === 0}
							onClick={() => void bell.markAll.mutate()}
						>
							Mark all read
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							disabled={bell.busy || bell.items.length === 0}
							onClick={() => void bell.clearAll.mutate()}
						>
							Clear all
						</Button>
					</div>
				</PopoverHeader>
				<div className="max-h-[min(60vh,24rem)] overflow-y-auto px-1 py-1">
					{bell.loading && !bell.data && (
						<div className="grid gap-2 p-2">
							{[0, 1, 2].map((index) => (
								<Skeleton key={index} className="h-14 w-full" />
							))}
						</div>
					)}
					{bell.error && !bell.data && (
						<div className="p-3">
							<QueryError
								message={bell.error.message}
								onRetry={() => void bell.reload()}
							/>
						</div>
					)}
					{bell.data && bell.items.length === 0 && (
						<p className="px-3 py-8 text-center text-sm text-muted-foreground">
							You're all caught up.
						</p>
					)}
					{bell.items.map((item) => (
						<NotificationBellRow
							key={item.id}
							item={item}
							busy={bell.busy || bell.deletingId === item.id}
							onOpen={(row) => void bell.openItem(row)}
							onDelete={(id) => void bell.deleteOne(id)}
						/>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}
