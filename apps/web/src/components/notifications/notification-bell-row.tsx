import { Trash2Icon } from "@/components/icons/trash-2"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatRelative, formatTimestamp } from "@/lib/format"
import { type NotificationItem, type NotificationKind } from "@/lib/queries"
import { cn } from "cn"
import {
	CheckCircle2,
	CircleAlert,
	Info,
	Loader2,
	TriangleAlert,
} from "lucide-react"

const KIND_META: Record<
	NotificationKind,
	{ icon: typeof Info; className: string }
> = {
	info: { icon: Info, className: "text-blue-600" },
	success: { icon: CheckCircle2, className: "text-green-600" },
	warning: { icon: TriangleAlert, className: "text-amber-600" },
	alert: { icon: CircleAlert, className: "text-destructive" },
}

/** One row in the notification popover list. */
export function NotificationBellRow({
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
				"group flex gap-2 rounded-md border border-transparent px-2 py-2 transition-colors",
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
					<span className="block truncate leading-snug font-medium">
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
						<TooltipContent>
							{formatTimestamp(item.createdAt)}
						</TooltipContent>
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
					<Trash2Icon size={14} className="flex" />
				)}
			</Button>
		</div>
	)
}
