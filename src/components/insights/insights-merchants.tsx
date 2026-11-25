import { CategoryIcon } from "@/components/transactions/tx-bits"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Category } from "@/lib/api"
import { CATEGORY_META } from "@/lib/categories"
import { formatMoney } from "@/lib/format"

/** Ranked merchant list; picking one filters the transactions list. */
export function InsightsMerchants({
	loading,
	merchants,
	category,
	merchant,
	onPick,
}: {
	loading: boolean
	merchants: {
		merchantKey: string
		merchant: string
		category: Category
		count: number
		total: number
	}[]
	category: Category | null
	merchant: string | null
	onPick: (key: string) => void
}) {
	return (
		<Card className="lg:col-span-2">
			<CardHeader>
				<CardTitle>Top merchants</CardTitle>
				<CardDescription>
					{category ? CATEGORY_META[category].label : "All spending"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{loading ? (
					<Skeleton className="h-64" />
				) : merchants.length === 0 ? (
					<p className="py-10 text-center text-sm text-muted-foreground">
						Nothing here yet.
					</p>
				) : (
					<ol className="grid gap-0.5">
						{merchants.map((topMerchant, i) => (
							<li key={topMerchant.merchantKey}>
								<button
									type="button"
									onClick={() =>
										onPick(topMerchant.merchantKey)
									}
									className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${merchant === topMerchant.merchantKey ? "bg-muted" : ""}`}
								>
									<span className="w-4 text-xs text-muted-foreground tabular-nums">
										{i + 1}
									</span>
									<CategoryIcon
										category={topMerchant.category}
									/>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium">
											{topMerchant.merchant}
										</span>
										<span className="block text-xs text-muted-foreground">
											{topMerchant.count} transaction
											{topMerchant.count === 1 ? "" : "s"}
										</span>
									</span>
									<span className="font-medium tabular-nums">
										{formatMoney(topMerchant.total)}
									</span>
								</button>
							</li>
						))}
					</ol>
				)}
			</CardContent>
		</Card>
	)
}
