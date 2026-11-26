import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * Smoothly shows or hides its children by animating the row height (grid 0fr to 1fr) and opacity.
 * Hidden content stays mounted, so inputs keep their value, but is made inert so it can't be
 * tabbed to or read out. The transition is skipped for people who prefer reduced motion.
 *
 * @param open Whether the content is shown.
 * @param spaced Adds the gap that separates this block from the one above it.
 * @param className Extra classes for the content wrapper.
 */
export function Reveal({
	open,
	spaced = true,
	className,
	children,
}: {
	open: boolean
	spaced?: boolean
	className?: string
	children: ReactNode
}) {
	return (
		<div
			inert={!open}
			className={cn(
				"grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
				open
					? "grid-rows-[1fr] opacity-100"
					: "grid-rows-[0fr] opacity-0"
			)}
		>
			{/* Horizontal padding leaves room for focus rings that overflow-hidden would clip. */}
			<div className="-mx-1 min-h-0 overflow-hidden px-1">
				<div
					className={cn(
						"grid gap-4 pb-1",
						spaced && "pt-4",
						className
					)}
				>
					{children}
				</div>
			</div>
		</div>
	)
}
