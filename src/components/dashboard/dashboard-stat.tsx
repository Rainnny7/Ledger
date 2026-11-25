import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import type { ReactNode } from "react"

/** Headline figure card for the dashboard, with optional hint, note and negative styling. */
export function DashboardStat({
	label,
	value,
	negative,
	hint,
	note,
}: {
	label: string
	value: ReactNode
	negative?: boolean
	hint?: string
	note?: string
}) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardDescription>{label}</CardDescription>
				<CardTitle
					className={`text-2xl! font-semibold tabular-nums ${negative ? "text-destructive" : ""}`}
				>
					{value}
				</CardTitle>
				{hint && (
					<p className="text-xs text-muted-foreground">{hint}</p>
				)}
				{note && (
					<p className="text-xs text-muted-foreground/80">{note}</p>
				)}
			</CardHeader>
		</Card>
	)
}
