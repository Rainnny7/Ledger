import { parseIso } from "@/lib/format"

/** Compact month/day badge for a due date. */
export function SubscriptionDateChip({ iso }: { iso: string }) {
	const date = parseIso(iso)
	return (
		<span className="flex w-10 shrink-0 flex-col items-center rounded-md border py-0.5 leading-tight">
			<span className="text-[10px] font-medium text-muted-foreground uppercase">
				{date.toLocaleDateString("en-CA", { month: "short" })}
			</span>
			<span className="text-sm font-semibold tabular-nums">
				{date.getDate()}
			</span>
		</span>
	)
}
