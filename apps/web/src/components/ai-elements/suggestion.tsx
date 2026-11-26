import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { cn } from "cn"
import type { ComponentProps } from "react"

/** Horizontal row container for suggestion chips. */
export type SuggestionsProps = ComponentProps<typeof ScrollArea>

/** Horizontal row container for suggestion chips. */
export function Suggestions({
	className,
	children,
	...props
}: SuggestionsProps) {
	return (
		<ScrollArea
			className="w-full overflow-x-auto whitespace-nowrap"
			{...props}
		>
			<div
				className={cn(
					"flex w-max max-w-full flex-wrap items-center gap-1.5",
					className
				)}
			>
				{children}
			</div>
			<ScrollBar className="hidden" orientation="horizontal" />
		</ScrollArea>
	)
}

/** Clickable suggested prompt chip. */
export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
	suggestion: string
	onClick?: (suggestion: string) => void
}

/** Clickable suggested prompt chip. */
export function Suggestion({
	suggestion,
	onClick,
	className,
	variant = "outline",
	size = "sm",
	children,
	...props
}: SuggestionProps) {
	const handleClick = () => {
		onClick?.(suggestion)
	}

	return (
		<Button
			className={cn(
				"h-auto max-w-full cursor-pointer rounded-full px-2.5 py-1 text-left text-[11px] leading-snug font-normal whitespace-normal",
				className
			)}
			onClick={handleClick}
			size={size}
			type="button"
			variant={variant}
			{...props}
		>
			{children ?? suggestion}
		</Button>
	)
}
