import { cn } from "cn"
import type { UIMessage } from "ai"
import type { ComponentProps, HTMLAttributes } from "react"
import { memo } from "react"
import { Streamdown } from "streamdown"

/** Root layout for one chat message row. */
export type MessageProps = HTMLAttributes<HTMLDivElement> & {
	from: UIMessage["role"]
}

/** Root layout for one chat message row. */
export function Message({ className, from, ...props }: MessageProps) {
	return (
		<div
			className={cn(
				"group flex w-full flex-col gap-1",
				from === "user"
					? "is-user ml-auto max-w-[88%] items-end"
					: "is-assistant max-w-full",
				className
			)}
			{...props}
		/>
	)
}

/** Bubble or body wrapper for message parts. */
export type MessageContentProps = HTMLAttributes<HTMLDivElement>

/** Bubble or body wrapper for message parts. */
export function MessageContent({
	children,
	className,
	...props
}: MessageContentProps) {
	return (
		<div
			className={cn(
				"min-w-0 text-[13px] leading-snug",
				"group-[.is-user]:rounded-xl group-[.is-user]:rounded-br-sm group-[.is-user]:bg-primary/12 group-[.is-user]:px-3 group-[.is-user]:py-1.5 group-[.is-user]:text-foreground dark:group-[.is-user]:bg-primary/20",
				"group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
				className
			)}
			{...props}
		>
			{children}
		</div>
	)
}

/** Assistant markdown body rendered via Streamdown. */
export type MessageResponseProps = ComponentProps<typeof Streamdown>

/** Assistant markdown body rendered via Streamdown. */
export const MessageResponse = memo(
	({ className, ...props }: MessageResponseProps) => (
		<Streamdown
			className={cn(
				"w-full text-[13px] leading-snug [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:mb-1.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-[13px] [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:font-medium [&_li]:leading-snug [&_ol]:mb-1.5 [&_ol]:list-decimal [&_ol]:space-y-0.5 [&_ol]:pl-3.5 [&_p]:mb-1.5 [&_p]:last:mb-0 [&_pre]:mb-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-1.5 [&_table]:mb-1.5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[11px] [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_ul]:mb-1.5 [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:pl-3.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
				className
			)}
			{...props}
		/>
	),
	(previousProps, nextProps) => previousProps.children === nextProps.children
)

MessageResponse.displayName = "MessageResponse"
