import { confirmDialog } from "@/lib/confirm"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { SubscriptionTableRow } from "@/components/subscriptions/subscription-table-row"
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { api, type Account, type Subscription } from "@/lib/api"

async function toggleSubscription(subscription: Subscription) {
	try {
		await api.updateSubscription(subscription.id, {
			active: !subscription.active,
		})
		toast.success(
			subscription.active
				? `${subscription.name} paused`
				: `${subscription.name} resumed`
		)
	} catch (error) {
		toastError((error as Error).message)
	}
}

async function removeSubscription(subscription: Subscription) {
	if (
		!(await confirmDialog({
			title: `Stop tracking ${subscription.name}?`,
			description:
				"It’subscription removed from your subscriptions. Your transactions aren’t affected.",
			action: "Stop tracking",
			destructive: true,
		}))
	) {
		return
	}
	try {
		await api.deleteSubscription(subscription.id)
		toast.success(`${subscription.name} removed`)
	} catch (error) {
		toastError((error as Error).message)
	}
}

/** Table of tracked subscriptions with per-row edit, share, pause and remove actions. */
export function SubscriptionsTable({
	sorted,
	accounts,
	focus,
	loading,
	onEdit,
	onShare,
}: {
	sorted: Subscription[]
	accounts: Account[]
	focus: Set<string>
	loading: boolean
	onEdit: (subscription: Subscription) => void
	onShare: (subscription: Subscription) => void
}) {
	if (loading) {
		return null
	}

	if (sorted.length === 0) {
		return null
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="pl-4">Name</TableHead>
					<TableHead className="hidden sm:table-cell">
						Next Payment
					</TableHead>
					<TableHead className="hidden md:table-cell">
						Last Charged
					</TableHead>
					<TableHead className="text-right">Amount</TableHead>
					<TableHead className="hidden text-right lg:table-cell">
						Per Month
					</TableHead>
					<TableHead className="w-12 pr-4">
						<span className="sr-only">Actions</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{sorted.map((subscription) => {
					const account = accounts.find(
						(linkedAccount) =>
							linkedAccount.id === subscription.accountId
					)
					return (
						<SubscriptionTableRow
							key={subscription.id}
							subscription={subscription}
							account={account}
							focused={focus.has(subscription.id)}
							onEdit={onEdit}
							onShare={onShare}
							onToggle={toggleSubscription}
							onRemove={removeSubscription}
						/>
					)
				})}
			</TableBody>
		</Table>
	)
}
