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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { NotificationScrollArea } from "@/components/notifications/notification-scroll-area"
import { NotificationBellList } from "@/components/notifications/notification-bell-list"
import {
	useNotificationBell,
	type NotificationBellTab,
} from "@/components/notifications/use-notification-bell"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { useState } from "react"
import { cn } from "cn"
import { Bell, BellOff, CheckCheck, Inbox, Settings } from "lucide-react"

function NotificationEmptyState({ tab }: { tab: NotificationBellTab }) {
	const unreadTab = tab === "unread"
	return (
		<div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
			{unreadTab ? (
				<BellOff
					className="size-8 text-muted-foreground/70"
					aria-hidden
				/>
			) : (
				<Inbox
					className="size-8 text-muted-foreground/70"
					aria-hidden
				/>
			)}
			<p className="text-sm font-medium">
				{unreadTab ? "No unread notifications" : "You're all caught up"}
			</p>
		</div>
	)
}

/** Header bell that lists in-app notifications. */
export function NotificationBell({ enabled }: { enabled: boolean }) {
	const bell = useNotificationBell(enabled)
	// Only animate the list after the user switches tabs, so opening the popover doesn't slide content in.
	const [tabSwitched, setTabSwitched] = useState(false)

	return (
		<Popover
			open={bell.open}
			onOpenChange={(open) => {
				if (open) {
					setTabSwitched(false)
				}
				bell.setOpen(open)
			}}
		>
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
				className="w-96 max-w-[calc(100vw-2rem)] gap-0 p-0"
			>
				<PopoverHeader className="flex-row items-center gap-2 border-b px-3 py-2.5">
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<PopoverTitle className="truncate">
							Notifications
						</PopoverTitle>
						{bell.unread > 0 && (
							<Badge
								variant="secondary"
								className="h-5 shrink-0 px-1.5 text-[11px]"
							>
								{bell.unread} unread
							</Badge>
						)}
					</div>
					<div className="flex shrink-0 gap-0.5">
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-8"
										aria-label="Mark all read"
										disabled={
											bell.busy || bell.unread === 0
										}
										onClick={() =>
											void bell.markAll.mutateAsync()
										}
									/>
								}
							>
								<CheckCheck className="size-4" />
							</TooltipTrigger>
							<TooltipContent>Mark all read</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-8"
										aria-label="Notification settings"
										disabled={bell.busy}
										onClick={bell.openNotificationSettings}
									/>
								}
							>
								<Settings className="size-4" />
							</TooltipTrigger>
							<TooltipContent>Settings</TooltipContent>
						</Tooltip>
					</div>
				</PopoverHeader>
				<Tabs
					value={bell.tab}
					onValueChange={(value) => {
						setTabSwitched(true)
						bell.setTab(value as NotificationBellTab)
					}}
					className="gap-0"
				>
					<TabsList
						variant="line"
						className="relative h-9 w-full rounded-none border-b bg-transparent px-2"
					>
						<TabsTrigger
							value="all"
							className="flex-1 after:hidden"
						>
							All
						</TabsTrigger>
						<TabsTrigger
							value="unread"
							className="flex-1 after:hidden"
						>
							Unread
						</TabsTrigger>
						{/* One underline that slides between tabs, instead of each tab fading its own. */}
						<TabsPrimitive.Indicator className="absolute bottom-[-1px] left-(--active-tab-left) h-0.5 w-(--active-tab-width) rounded-full bg-primary transition-[left,width] duration-300 ease-out motion-reduce:transition-none" />
					</TabsList>
					<NotificationScrollArea>
						{bell.loading && !bell.data && (
							<div className="grid gap-2 p-2">
								{[0, 1, 2].map((index) => (
									<Skeleton
										key={index}
										className="h-14 w-full"
									/>
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
						{bell.data && (
							<>
								<TabsContent
									value="all"
									className={cn(
										"mt-0",
										tabSwitched &&
											bell.tab === "all" &&
											"animate-in duration-200 ease-out fade-in-0 slide-in-from-left-4 motion-reduce:animate-none"
									)}
								>
									{!bell.listHasRows ? (
										<NotificationEmptyState tab="all" />
									) : (
										<NotificationBellList
											items={bell.items ?? []}
											expandedId={bell.expandedId}
											actionId={bell.actionId}
											busy={bell.busy}
											onOpen={bell.openItem}
											onToggleRead={bell.toggleRead}
											onDelete={bell.deleteOne}
											onExitComplete={bell.finishExit}
										/>
									)}
								</TabsContent>
								<TabsContent
									value="unread"
									className={cn(
										"mt-0",
										tabSwitched &&
											bell.tab === "unread" &&
											"animate-in duration-200 ease-out fade-in-0 slide-in-from-right-4 motion-reduce:animate-none"
									)}
								>
									{!bell.unreadListHasRows ? (
										<NotificationEmptyState tab="unread" />
									) : (
										<NotificationBellList
											items={bell.filtered}
											expandedId={bell.expandedId}
											actionId={bell.actionId}
											busy={bell.busy}
											onOpen={bell.openItem}
											onToggleRead={bell.toggleRead}
											onDelete={bell.deleteOne}
											onExitComplete={bell.finishExit}
										/>
									)}
								</TabsContent>
							</>
						)}
					</NotificationScrollArea>
				</Tabs>
				{bell.data && bell.listHasRows && (
					<div className="border-t px-3 py-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 w-full text-xs text-muted-foreground"
							disabled={bell.busy}
							onClick={() => void bell.confirmClearAll()}
						>
							Clear all
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	)
}
