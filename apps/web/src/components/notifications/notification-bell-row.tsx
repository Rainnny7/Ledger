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
	ChartPie,
	Check,
	CheckCircle2,
	Circle,
	CircleAlert,
	Info,
	Megaphone,
	ShieldCheck,
	TriangleAlert,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

const KIND_META: Record<
	NotificationKind,
	{ icon: LucideIcon; tileClass: string }
> = {
	info: { icon: Info, tileClass: "bg-blue-500/15 text-blue-600" },
	success: {
		icon: CheckCircle2,
		tileClass: "bg-green-500/15 text-green-600",
	},
	warning: {
		icon: TriangleAlert,
		tileClass: "bg-amber-500/15 text-amber-600",
	},
	alert: { icon: CircleAlert, tileClass: "bg-red-500/15 text-destructive" },
}

const SOURCE_META: Record<string, { icon: LucideIcon; tileClass: string }> = {
	admin: { icon: Megaphone, tileClass: "bg-violet-500/15 text-violet-600" },
	security: {
		icon: ShieldCheck,
		tileClass: "bg-emerald-500/15 text-emerald-600",
	},
	digest: { icon: ChartPie, tileClass: "bg-orange-500/15 text-orange-600" },
}

function rowVisual(item: NotificationItem) {
	if (item.source && SOURCE_META[item.source]) {
		return SOURCE_META[item.source]!
	}
	return KIND_META[item.kind]
}

/** One row in the notification popover list. */
export function NotificationBellRow({
	item,
	expanded,
	busy,
	onOpen,
	onToggleRead,
	onDelete,
}: {
	item: NotificationItem
	expanded: boolean
	busy: boolean
	onOpen: (item: NotificationItem) => void
	onToggleRead: (item: NotificationItem) => void
	onDelete: (id: string) => void
}) {
	const unread = !item.readAt
	const visual = rowVisual(item)
	const Icon = visual.icon
	return (
		<div
			className={cn(
				"group relative flex gap-2 rounded-lg px-2 py-2 transition-colors",
				"focus-within:bg-muted/60 hover:bg-muted/60"
			)}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 gap-2.5 text-left"
				onClick={() => onOpen(item)}
			>
				<span
					className={cn(
						"mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
						visual.tileClass
					)}
				>
					<Icon className="size-4" aria-hidden />
				</span>
				<span className="min-w-0 flex-1 pr-4">
					<span
						className={cn(
							"flex items-start gap-2 leading-snug",
							unread ? "font-medium" : "font-normal"
						)}
					>
						<span className="min-w-0 flex-1 truncate">
							{item.title}
						</span>
						{unread && (
							<span
								className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
								aria-hidden
							/>
						)}
					</span>
					<span
						className={cn(
							"mt-0.5 text-xs text-muted-foreground",
							expanded ? "whitespace-pre-wrap" : "line-clamp-2"
						)}
					>
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
			<div className="absolute top-1.5 right-1 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								type="button"
								variant="secondary"
								size="icon"
								className="size-7"
								aria-label={
									unread
										? `Mark ${item.title} as read`
										: `Mark ${item.title} as unread`
								}
								disabled={busy}
								onClick={() => onToggleRead(item)}
							/>
						}
					>
						{unread ? (
							<Check className="size-3.5" />
						) : (
							<Circle className="size-3.5" />
						)}
					</TooltipTrigger>
					<TooltipContent>
						{unread ? "Mark read" : "Mark unread"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								type="button"
								variant="secondary"
								size="icon"
								className="size-7"
								aria-label={`Remove ${item.title}`}
								disabled={busy}
								onClick={() => onDelete(item.id)}
							/>
						}
					>
						<Trash2Icon size={14} className="flex" />
					</TooltipTrigger>
					<TooltipContent>Delete</TooltipContent>
				</Tooltip>
			</div>
		</div>
	)
}
