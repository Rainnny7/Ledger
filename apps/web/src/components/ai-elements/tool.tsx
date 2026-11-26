import { Badge } from "@/components/ui/badge"
import { Loader } from "@/components/ai-elements/loader"
import { cn } from "cn"
import type { ToolUIPart } from "ai"
import { CheckIcon } from "lucide-react"
import type { ComponentProps } from "react"

/** Human-readable label shown while a tool runs. */
export type ToolStatusChipProps = ComponentProps<"div"> & {
	label: string
	state: ToolUIPart["state"]
}

/** Compact tool-call status: spinner while running, check when finished. */
export function ToolStatusChip({
	label,
	state,
	className,
	...props
}: ToolStatusChipProps) {
	const done = state === "output-available"
	const running =
		state === "input-streaming" ||
		state === "input-available" ||
		state === "approval-responded"

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-2 py-0.5",
				className
			)}
			{...props}
		>
			<Badge
				variant="secondary"
				className="gap-1 rounded-full px-2 py-0.5 text-[11px] font-normal"
			>
				{done ? (
					<CheckIcon className="size-3 text-primary" aria-hidden />
				) : running ? (
					<Loader size={12} aria-hidden />
				) : null}
				<span>{label}</span>
			</Badge>
		</div>
	)
}
