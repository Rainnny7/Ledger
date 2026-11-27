import { useRef } from "react"
import { NotificationBellRow } from "@/components/notifications/notification-bell-row"
import { groupNotificationsByDay } from "@/components/notifications/notification-day-groups"
import type { NotificationItem } from "@/lib/queries"
import { AnimatePresence, m, useReducedMotion } from "motion/react"

const EXIT_DURATION = 0.22

function AnimatedNotificationRow({
	item,
	expanded,
	busy,
	onOpen,
	onToggleRead,
	onDelete,
	onExitComplete,
	rowExit,
	transition,
}: {
	item: NotificationItem
	expanded: boolean
	busy: boolean
	onOpen: (item: NotificationItem) => void
	onToggleRead: (item: NotificationItem) => void
	onDelete: (id: string) => void
	onExitComplete: (id: string) => void
	rowExit: {
		opacity: number
		x?: number
		height?: number
		marginTop?: number
		marginBottom?: number
	}
	transition: { duration: number; ease: "easeOut" }
}) {
	const exitingRef = useRef(false)
	return (
		<m.div
			layout
			initial={false}
			exit={rowExit}
			transition={transition}
			className="overflow-x-hidden"
			onAnimationStart={(definition) => {
				exitingRef.current =
					typeof definition === "string" && definition === "exit"
			}}
			onAnimationComplete={() => {
				if (exitingRef.current) {
					exitingRef.current = false
					onExitComplete(item.id)
				}
			}}
		>
			<NotificationBellRow
				item={item}
				expanded={expanded}
				busy={busy}
				onOpen={onOpen}
				onToggleRead={onToggleRead}
				onDelete={onDelete}
			/>
		</m.div>
	)
}

/** Scrollable list with sticky day headings. */
export function NotificationBellList({
	items,
	expandedId,
	actionId,
	busy,
	onOpen,
	onToggleRead,
	onDelete,
	onExitComplete,
}: {
	items: NotificationItem[]
	expandedId: string | null
	actionId: string | null
	busy: boolean
	onOpen: (item: NotificationItem) => void
	onToggleRead: (item: NotificationItem) => void
	onDelete: (id: string) => void
	onExitComplete: (id: string) => void
}) {
	const reduceMotion = useReducedMotion()
	const groups = groupNotificationsByDay(items)
	const rowExit = reduceMotion
		? { opacity: 0 }
		: { opacity: 0, x: -10, height: 0, marginTop: 0, marginBottom: 0 }
	const headingExit = reduceMotion
		? { opacity: 0 }
		: { opacity: 0, height: 0 }
	const transition = {
		duration: reduceMotion ? 0.12 : EXIT_DURATION,
		ease: "easeOut" as const,
	}

	return (
		<div className="flex flex-col overflow-x-hidden">
			<AnimatePresence initial={false} mode="popLayout">
				{groups.map((group) => (
					<m.section
						key={group.group}
						layout
						initial={false}
						exit={headingExit}
						transition={transition}
						className="overflow-x-hidden"
					>
						<m.h3
							layout="position"
							className="sticky top-0 z-10 bg-popover px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
						>
							{group.label}
						</m.h3>
						<AnimatePresence initial={false} mode="popLayout">
							{group.items.map((item) => (
								<AnimatedNotificationRow
									key={item.id}
									item={item}
									expanded={expandedId === item.id}
									busy={busy || actionId === item.id}
									onOpen={onOpen}
									onToggleRead={onToggleRead}
									onDelete={onDelete}
									onExitComplete={onExitComplete}
									rowExit={rowExit}
									transition={transition}
								/>
							))}
						</AnimatePresence>
					</m.section>
				))}
			</AnimatePresence>
		</div>
	)
}
