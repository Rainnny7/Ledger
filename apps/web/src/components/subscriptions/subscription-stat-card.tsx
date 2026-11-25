import type { ReactNode } from "react"
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Small summary card showing one headline subscription figure. */
export function SubscriptionStatCard({
	label,
	value,
	hint,
	loading,
}: {
	label: string
	value: ReactNode
	hint?: string
	loading?: boolean
}) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardDescription>{label}</CardDescription>
				{loading ? (
					<Skeleton className="h-8 w-28" />
				) : (
					<CardTitle className="text-2xl! font-semibold tabular-nums">
						{value}
					</CardTitle>
				)}
				{hint && !loading && (
					<p className="truncate text-xs text-muted-foreground">
						{hint}
					</p>
				)}
			</CardHeader>
		</Card>
	)
}
