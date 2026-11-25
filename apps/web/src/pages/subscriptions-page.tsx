import { Plus, Repeat } from "lucide-react"
import { AnimatedMoney } from "@/components/common/count-up"
import { SubscriptionCalendarCard } from "@/components/subscriptions/subscription-calendar-card"
import { SubscriptionComingUp } from "@/components/subscriptions/subscription-coming-up"
import { SubscriptionDialog } from "@/components/subscriptions/subscription-dialog"
import { SubscriptionStatCard } from "@/components/subscriptions/subscription-stat-card"
import { SubscriptionSuggestionsCard } from "@/components/subscriptions/subscription-suggestions-card"
import { SubscriptionsTable } from "@/components/subscriptions/subscriptions-table"
import { subscriptionDueLabel } from "@/components/subscriptions/subscription-utils"
import { useSubscriptionsPage } from "@/components/subscriptions/use-subscriptions-page"
import { ShareDialog } from "@/components/sharing/share-bits"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { QueryError } from "@/components/ui/query-error"
import { Skeleton } from "@/components/ui/skeleton"

/** Recurring charges, upcoming payments, and calendar view. */
export function SubscriptionsPage() {
	const page = useSubscriptionsPage()

	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Subscriptions
					</h1>
					<p className="text-sm text-muted-foreground">
						Recurring payments, when they’re due and what they cost
						you.
					</p>
				</div>
				<Button onClick={() => page.openNew()}>
					<Plus /> Add subscription
				</Button>
			</div>

			{page.error && !page.data && (
				<QueryError
					message={page.error.message}
					onRetry={() => void page.reload()}
				/>
			)}

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<SubscriptionStatCard
					label="Per month"
					value={<AnimatedMoney value={page.monthly} />}
					hint="Longer & shorter plans averaged"
					loading={page.loading && !page.data}
				/>
				<SubscriptionStatCard
					label="Per year"
					value={<AnimatedMoney value={page.monthly * 12} />}
					loading={page.loading && !page.data}
				/>
				<SubscriptionStatCard
					label="Due in the next 30 days"
					value={
						<AnimatedMoney
							value={page.fx.sum(
								page.due30.map((item) => [
									item.s.amount,
									item.s.currency,
								])
							)}
						/>
					}
					hint={`${page.due30.length} payment${page.due30.length === 1 ? "" : "s"}`}
					loading={page.loading && !page.data}
				/>
				<SubscriptionStatCard
					label="Next payment"
					value={
						page.next ? (
							<AnimatedMoney
								value={page.next.amount}
								currency={page.next.currency}
							/>
						) : (
							"—"
						)
					}
					hint={
						page.next
							? `${page.next.name} · ${subscriptionDueLabel(page.next.nextDue)}`
							: "Nothing tracked yet"
					}
					loading={page.loading && !page.data}
				/>
			</div>

			<SubscriptionSuggestionsCard
				suggestions={page.suggestions}
				focus={page.focus}
				currency={page.suggestionCurrency}
				onTrack={(group) => void page.track(group)}
				onDismiss={(group) => void page.dismiss(group)}
			/>

			<div className="grid gap-4 lg:grid-cols-5">
				<Card className="lg:col-span-3">
					<SubscriptionCalendarCard
						subs={page.active}
						onSelect={page.edit}
						onAdd={page.openNew}
					/>
				</Card>
				<Card className="lg:col-span-2">
					<SubscriptionComingUp
						due30={page.due30}
						onSelect={page.edit}
					/>
				</Card>
			</div>

			<Card className="gap-0 pb-0">
				<CardHeader className="pb-4">
					<CardTitle>All subscriptions</CardTitle>
					<CardDescription>
						{page.active.length} active
						{page.subs.length > page.active.length
							? ` · ${page.subs.length - page.active.length} paused`
							: ""}
						{page.shared.length > 0
							? ` · ${page.shared.length} shared with you`
							: ""}
					</CardDescription>
				</CardHeader>
				<CardContent className="px-0">
					{page.loading && !page.data ? (
						<div className="grid gap-2 p-4">
							{[0, 1, 2].map((i) => (
								<Skeleton key={i} className="h-10" />
							))}
						</div>
					) : page.sorted.length === 0 ? (
						<div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
							<Repeat className="size-8 text-muted-foreground" />
							<div>
								<p className="font-medium">
									No subscriptions yet
								</p>
								<p className="text-sm text-muted-foreground">
									Add one manually, track a detected charge
									above, or open any transaction and choose
									“Track as subscription”.
								</p>
							</div>
						</div>
					) : (
						<SubscriptionsTable
							sorted={page.sorted}
							accounts={page.accounts}
							focus={page.focus}
							loading={false}
							onEdit={page.edit}
							onShare={page.setSharing}
						/>
					)}
				</CardContent>
			</Card>

			<ShareDialog
				kind="subscription"
				item={page.sharing}
				onClose={() => page.setSharing(null)}
			/>
			<SubscriptionDialog
				draft={page.draft}
				existing={page.editing}
				accounts={page.accounts}
				onClose={page.closeDialog}
			/>
		</div>
	)
}
