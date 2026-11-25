import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"

/** React/UI entry: `InvoiceStat`. */
export function InvoiceStat({
	label,
	value,
	hint,
	tone,
}: {
	label: string
	value: ReactNode
	hint: string
	tone?: "bad"
}) {
	return (
		<Card size="sm">
			<CardContent className="grid gap-1">
				<span className="text-xs font-medium text-muted-foreground">
					{label}
				</span>
				<span
					className={
						tone === "bad"
							? "text-xl font-semibold text-red-600 tabular-nums dark:text-red-400"
							: "text-xl font-semibold tabular-nums"
					}
				>
					{value}
				</span>
				<span className="text-xs text-muted-foreground">{hint}</span>
			</CardContent>
		</Card>
	)
}
