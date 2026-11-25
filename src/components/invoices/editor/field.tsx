import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "cn"

/** React/UI entry: `Field`. */
export function Field({
	id,
	label,
	children,
}: {
	id: string
	label: string
	children: React.ReactNode
}) {
	return (
		<div className="grid min-w-0 gap-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
		</div>
	)
}

/** React/UI entry: `TotalsRow`. */
export function TotalsRow({
	label,
	value,
	strong,
}: {
	label: string
	value: ReactNode
	strong?: boolean
}) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-3",
				strong && "text-base font-semibold"
			)}
		>
			<span className={strong ? undefined : "text-muted-foreground"}>
				{label}
			</span>
			<span className="tabular-nums">{value}</span>
		</div>
	)
}
