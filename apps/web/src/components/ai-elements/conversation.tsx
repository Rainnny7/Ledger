import { Button } from "@/components/ui/button"
import { cn } from "cn"
import { ArrowDownIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { useCallback } from "react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"

/** Scrollable chat region that sticks to the latest message. */
export type ConversationProps = ComponentProps<typeof StickToBottom>

/** Scrollable chat region that sticks to the latest message. */
export function Conversation({ className, ...props }: ConversationProps) {
	return (
		<StickToBottom
			className={cn("relative flex-1 overflow-y-hidden", className)}
			initial="instant"
			resize="smooth"
			role="log"
			{...props}
		/>
	)
}

/** Inner message list inside a conversation scroll area. */
export type ConversationContentProps = ComponentProps<
	typeof StickToBottom.Content
>

/** Inner message list inside a conversation scroll area. */
export function ConversationContent({
	className,
	...props
}: ConversationContentProps) {
	return (
		<StickToBottom.Content
			className={cn("flex flex-col gap-2.5 p-2.5", className)}
			{...props}
		/>
	)
}

/** Placeholder shown before the first message. */
export type ConversationEmptyStateProps = ComponentProps<"div"> & {
	title?: string
	description?: string
	icon?: React.ReactNode
}

/** Placeholder shown before the first message. */
export function ConversationEmptyState({
	className,
	title = "No messages yet",
	description = "Start a conversation to see messages here",
	icon,
	children,
	...props
}: ConversationEmptyStateProps) {
	return (
		<div
			className={cn(
				"flex size-full flex-col items-center justify-center gap-3 p-6 text-center",
				className
			)}
			{...props}
		>
			{children ?? (
				<>
					{icon ? (
						<div className="text-muted-foreground">{icon}</div>
					) : null}
					<div className="space-y-1">
						<h3 className="text-sm font-medium">{title}</h3>
						{description ? (
							<p className="text-sm text-muted-foreground">
								{description}
							</p>
						) : null}
					</div>
				</>
			)}
		</div>
	)
}

/** Floating control to jump back to the latest message. */
export type ConversationScrollButtonProps = ComponentProps<typeof Button>

/** Floating control to jump back to the latest message. */
export function ConversationScrollButton({
	className,
	...props
}: ConversationScrollButtonProps) {
	const { isAtBottom, scrollToBottom } = useStickToBottomContext()

	const handleScrollToBottom = useCallback(() => {
		scrollToBottom()
	}, [scrollToBottom])

	if (isAtBottom) {
		return null
	}

	return (
		<Button
			className={cn(
				"absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card text-foreground shadow-md hover:bg-muted dark:bg-card",
				className
			)}
			onClick={handleScrollToBottom}
			size="icon"
			type="button"
			variant="secondary"
			{...props}
		>
			<ArrowDownIcon className="size-4 text-foreground" />
		</Button>
	)
}
