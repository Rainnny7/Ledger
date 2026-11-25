import {
  NO_SUBSCRIPTION_ACCOUNT,
  type SubscriptionForm,
  subscriptionAccountItems,
} from "@/components/subscriptions/subscription-form"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Account, Subscription } from "@/lib/api"

/** Linked account picker, or a read-only line when editing someone else's plan. */
export function SubscriptionPaidFrom({
  theirs,
  existing,
  form,
  accounts,
  onAccount,
}: {
  theirs: boolean
  existing?: Subscription | null
  form: SubscriptionForm
  accounts: Account[]
  onAccount: (id: string, currency?: string) => void
}) {
  const accountItems = subscriptionAccountItems(accounts)

  if (theirs) {
    return (
      <div className="grid min-w-0 gap-2">
        <Label>Paid from</Label>
        <p className="flex h-8 items-center truncate text-sm text-muted-foreground">
          {existing?.owner?.name || "The owner"}’s account
        </p>
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-2">
      <Label>Paid from</Label>
      <Select
        items={accountItems}
        value={form.accountId}
        onValueChange={(v) => {
          const id = v ?? NO_SUBSCRIPTION_ACCOUNT
          const linked = accounts.find((a) => a.id === v)
          onAccount(id, linked?.currency)
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {(v: string) => (
              <span className="truncate">
                {accountItems.find((a) => a.value === v)?.label}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accountItems.map((a) => (
            <SelectItem
              key={a.value}
              value={a.value}
              className="max-w-[min(24rem,85vw)]"
            >
              <span className="truncate">{a.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
