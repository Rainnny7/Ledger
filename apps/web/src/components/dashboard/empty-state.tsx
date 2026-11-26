import { InstitutionBadge } from "@/components/accounts/institution"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plus } from "lucide-react"

/** First-run prompt shown before any account has been added. */
export function DashboardEmptyState({ onAdd }: { onAdd: () => void }) {
	return (
		<Card className="items-center py-14 text-center">
			<CardContent className="flex flex-col items-center gap-4">
				<div className="flex -space-x-2">
					<InstitutionBadge
						institution="td"
						className="size-12 text-base ring-4 ring-card"
					/>
					<InstitutionBadge
						institution="paypal"
						className="size-12 text-base ring-4 ring-card"
					/>
				</div>
				<div>
					<h2 className="font-semibold">
						Connect your first account
					</h2>
					<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
						Link TD EasyWeb or PayPal to see your balances,
						overdraft and transactions in one place.
					</p>
				</div>
				<Button data-tour="dashboard-connect" onClick={onAdd}>
					<Plus /> Add account
				</Button>
			</CardContent>
		</Card>
	)
}
