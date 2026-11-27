import { useRef, type ReactNode } from "react"
import { useScrollFade } from "@/components/common/use-scroll-fade"

/**
 * Scrolling body of the notification popover. Its top and bottom edges fade while more
 * notifications lie beyond them. It is its own component so the fade hook attaches when the
 * popover content mounts, not when the bell button does.
 */
export function NotificationScrollArea({ children }: { children: ReactNode }) {
	const scrollRef = useRef<HTMLDivElement>(null)
	useScrollFade(scrollRef)
	return (
		<div
			ref={scrollRef}
			className="max-h-[min(60vh,24rem)] scroll-fade-y overflow-x-hidden overflow-y-auto"
		>
			{children}
		</div>
	)
}
