import type { ComponentProps } from "react"
import { cn } from "cn"

/** A keyboard key hint, styled like shadcn's Kbd. */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd"
			className={cn(
				"pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none",
				className
			)}
			{...props}
		/>
	)
}
