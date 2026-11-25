import type { ReactNode } from "react"
import { AnimatedMoney } from "@/components/common/count-up"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "cn"

/** A titled column of statement rows. */
export function StatementColumn({
	title,
	children,
}: {
	title: string
	children: ReactNode
}) {
	return (
		<section className="min-w-0">
			<h3 className="pb-1 text-sm font-medium text-muted-foreground">
				{title}
			</h3>
			<dl>{children}</dl>
		</section>
	)
}

/** One line of the statement: what it is on the left, the amount on the right. */
export function StatementRow({
	label,
	hint,
	value,
	loading,
	total,
	sign,
	negative,
}: {
	label: string
	hint?: string
	value: number
	loading: boolean
	total?: boolean
	sign?: boolean
	negative?: boolean
}) {
	return (
		<div
			className={cn(
				"flex items-baseline justify-between gap-4 py-2",
				total
					? "border-t border-foreground/20"
					: "border-b border-dashed last:border-b-0"
			)}
		>
			<dt className="min-w-0">
				<span className={cn(total && "font-semibold")}>{label}</span>
				{hint && (
					<span className="block text-xs text-muted-foreground">
						{hint}
					</span>
				)}
			</dt>
			<dd
				className={cn(
					"shrink-0 text-right tabular-nums",
					total ? "text-xl font-semibold" : "text-lg font-medium",
					negative && "text-destructive"
				)}
			>
				{loading ? (
					<Skeleton className="h-6 w-24" />
				) : (
					<AnimatedMoney value={value} sign={sign} />
				)}
			</dd>
		</div>
	)
}
