import { SparklesIcon } from "@/components/icons/sparkles"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { askLedger } from "@/lib/ask-ledger"
import { useHideAiSuggestions } from "@/lib/use-hide-ai-suggestions"
import { useAppConfig } from "@/lib/queries"
import { cn } from "cn"
import type { ComponentProps } from "react"

/** Visual style: `compact` is an icon button with a tooltip, `tip` is a labelled inline chip. */
export type AskLedgerButtonVariant = "compact" | "tip"

const askLedgerAccentClass =
	"border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"

/** Props for {@link AskLedgerButton}. */
export interface AskLedgerButtonProps {
	/** Full prompt sent to Ask Ledger when clicked. */
	prompt: string
	/** Title Case control label (tooltip for compact, visible text for tip). */
	label: string
	variant?: AskLedgerButtonVariant
	className?: string
}

/**
 * Contextual entry into Ask Ledger. Renders nothing when AI chat is off or the user hid suggestions.
 */
export function AskLedgerButton({
	prompt,
	label,
	variant = "compact",
	className,
}: AskLedgerButtonProps) {
	const config = useAppConfig()
	const hidden = useHideAiSuggestions()
	if (!config?.aiChat || hidden) {
		return null
	}

	function handleClick(event: React.MouseEvent) {
		event.stopPropagation()
		askLedger(prompt)
	}

	if (variant === "tip") {
		return (
			<TipChip
				label={label}
				className={className}
				onClick={handleClick}
			/>
		)
	}

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						type="button"
						variant="outline"
						size="icon-xs"
						className={cn(
							"shrink-0",
							askLedgerAccentClass,
							className
						)}
						aria-label={label}
						onClick={handleClick}
					/>
				}
			>
				<SparklesIcon size={16} className="flex" />
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	)
}

/** Inline chip styled like chat suggestion chips. */
function TipChip({
	label,
	className,
	onClick,
}: {
	label: string
	className?: string
	onClick: ComponentProps<"button">["onClick"]
}) {
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className={cn(
				"h-auto gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-snug font-normal",
				askLedgerAccentClass,
				className
			)}
			onClick={onClick}
		>
			<SparklesIcon size={14} className="flex shrink-0" />
			{label}
		</Button>
	)
}
