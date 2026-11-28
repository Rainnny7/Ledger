import type { ReactElement, ReactNode } from "react"
import {
	type SharedTooltipHandle,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * A styled tooltip around one element: the app's stand-in for the browser's `title` attribute.
 * The child becomes the trigger, so it keeps its own tag, props and click handler.
 */
export function Hint({
	label,
	children,
	side,
	className,
	handle,
}: {
	label: ReactNode
	children: ReactElement
	side?: "top" | "bottom" | "left" | "right"
	className?: string
	/** When set, uses a shared tooltip root instead of owning one. */
	handle?: SharedTooltipHandle
}) {
	if (label === null || label === undefined || label === "") {
		return children
	}
	if (handle) {
		return (
			<TooltipTrigger
				handle={handle}
				payload={{ label, side, className }}
				render={children}
			/>
		)
	}
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent side={side} className={className}>
				{label}
			</TooltipContent>
		</Tooltip>
	)
}
