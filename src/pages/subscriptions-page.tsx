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
import { Skeleton } from "@/components/ui/skeleton"

export function SubscriptionsPage() {
  const p = useSubscriptionsPage()

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Subscriptions
          </h1>
          <p className="text-sm text-muted-foreground">
            Recurring payments, when they’re due and what they cost you.
          </p>
        </div>
        <Button onClick={() => p.openNew()}>
          <Plus /> Add subscription
        </Button>
      </div>

      {p.error && <p className="text-sm text-destructive">{p.error.message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SubscriptionStatCard
          label="Per month"
          value={<AnimatedMoney value={p.monthly} />}
          hint="Longer & shorter plans averaged"
          loading={p.loading && !p.data}
        />
        <SubscriptionStatCard
          label="Per year"
          value={<AnimatedMoney value={p.monthly * 12} />}
          loading={p.loading && !p.data}
        />
        <SubscriptionStatCard
          label="Due in the next 30 days"
          value={
            <AnimatedMoney
              value={p.fx.sum(p.due30.map((x) => [x.s.amount, x.s.currency]))}
            />
          }
          hint={`${p.due30.length} payment${p.due30.length === 1 ? "" : "s"}`}
          loading={p.loading && !p.data}
        />
        <SubscriptionStatCard
          label="Next payment"
          value={
            p.next ? (
              <AnimatedMoney value={p.next.amount} currency={p.next.currency} />
            ) : (
              "—"
            )
          }
          hint={
            p.next
              ? `${p.next.name} · ${subscriptionDueLabel(p.next.nextDue)}`
              : "Nothing tracked yet"
          }
          loading={p.loading && !p.data}
        />
      </div>

      <SubscriptionSuggestionsCard
        suggestions={p.suggestions}
        focus={p.focus}
        currency={p.suggestionCurrency}
        onTrack={(g) => void p.track(g)}
        onDismiss={(g) => void p.dismiss(g)}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SubscriptionCalendarCard
            subs={p.active}
            onSelect={p.edit}
            onAdd={p.openNew}
          />
        </Card>
        <Card className="lg:col-span-2">
          <SubscriptionComingUp due30={p.due30} onSelect={p.edit} />
        </Card>
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>All subscriptions</CardTitle>
          <CardDescription>
            {p.active.length} active
            {p.subs.length > p.active.length
              ? ` · ${p.subs.length - p.active.length} paused`
              : ""}
            {p.shared.length > 0 ? ` · ${p.shared.length} shared with you` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {p.loading && !p.data ? (
            <div className="grid gap-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : p.sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <Repeat className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No subscriptions yet</p>
                <p className="text-sm text-muted-foreground">
                  Add one manually, track a detected charge above, or open any
                  transaction and choose “Track as subscription”.
                </p>
              </div>
            </div>
          ) : (
            <SubscriptionsTable
              sorted={p.sorted}
              accounts={p.accounts}
              focus={p.focus}
              loading={false}
              onEdit={p.edit}
              onShare={p.setSharing}
            />
          )}
        </CardContent>
      </Card>

      <ShareDialog
        kind="subscription"
        item={p.sharing}
        onClose={() => p.setSharing(null)}
      />
      <SubscriptionDialog
        draft={p.draft}
        existing={p.editing}
        accounts={p.accounts}
        onClose={p.closeDialog}
      />
    </div>
  )
}
