import type { InvoiceState } from "@/components/invoices/invoice-state"
import { cn } from "cn"

const STATE: Record<InvoiceState, { label: string; className: string }> = {
	draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
	sent: {
		label: "Sent",
		className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
	},
	viewed: {
		label: "Viewed",
		className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
	},
	overdue: {
		label: "Overdue",
		className: "bg-red-500/15 text-red-700 dark:text-red-300",
	},
	partial: {
		label: "Partly paid",
		className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	},
	paid: {
		label: "Paid",
		className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	},
	void: {
		label: "Void",
		className: "bg-muted text-muted-foreground line-through",
	},
}

/** React/UI entry: `StateBadge`. */
export function StateBadge({
	state,
	className,
}: {
	state: InvoiceState
	className?: string
}) {
	const tone = STATE[state]
	return (
		<span
			className={cn(
				"inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
				tone.className,
				className
			)}
		>
			{tone.label}
		</span>
	)
}
