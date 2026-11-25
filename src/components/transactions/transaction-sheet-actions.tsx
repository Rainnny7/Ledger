import { Money } from "@/components/common/money"
import { GoalIcon } from "@/components/goals/goal-bits"
import type { PaymentDraft } from "@/components/goals/goal-form"
import { Check, Loader2, Plus, Repeat, Target, Unlink } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Goal, Subscription, Transaction } from "@/lib/api"
import { api } from "@/lib/api"
import { queryClient } from "@/lib/queries"
import { cn } from "cn"
import { useState } from "react"

export function TransactionSheetActions({
  t,
  openGoals,
  subs,
  countedFor,
  countedByHand,
  dirty,
  saving,
  onSave,
  onPayGoal,
  linked,
}: {
  t: Transaction
  openGoals: Goal[]
  subs: Subscription[]
  countedFor: Subscription | undefined
  countedByHand: boolean
  dirty: boolean
  saving: boolean
  onSave: () => void
  onPayGoal: (draft: PaymentDraft) => void
  linked: Goal[]
}) {
  const navigate = useNavigate()
  const [linking, setLinking] = useState(false)

  async function countToward(subscriptionId: string | null) {
    setLinking(true)
    try {
      await api.linkSubscriptionCharge(t.id, subscriptionId)
      await queryClient.invalidateQueries()
      const name = subs.find((s) => s.id === subscriptionId)?.name
      toast.success(
        name
          ? `Counted toward ${name}`
          : "No longer counted toward a subscription"
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLinking(false)
    }
  }

  function trackAsSubscription() {
    const q = new URLSearchParams({
      track: t.merchantKey,
      name: t.merchant,
      amount: String(Math.abs(t.amount)),
      date: t.date,
      account: t.accountId,
    })
    navigate(`/subscriptions?${q}`)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!dirty || saving} onClick={() => void onSave()}>
          {saving && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
        {t.amount < 0 &&
          (subs.length === 0 ? (
            <Button variant="outline" onClick={trackAsSubscription}>
              <Repeat /> Track as subscription
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" disabled={linking} />}
              >
                {linking ? <Loader2 className="animate-spin" /> : <Repeat />}{" "}
                Subscription
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 min-w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    Count this charge toward…
                  </DropdownMenuLabel>
                  {subs.map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      disabled={countedFor?.id === s.id && countedByHand}
                      onClick={() => void countToward(s.id)}
                    >
                      <Check
                        className={cn(countedFor?.id !== s.id && "invisible")}
                      />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        <Money value={s.amount} currency={s.currency} />
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {countedByHand && (
                  <DropdownMenuItem onClick={() => void countToward(null)}>
                    <Unlink /> Stop counting it
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={trackAsSubscription}>
                  <Plus /> Track as a new subscription
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        {openGoals.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <Target /> Add to goal
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuLabel>Count this toward…</DropdownMenuLabel>
              {openGoals.map((g) => (
                <DropdownMenuItem
                  key={g.id}
                  onClick={() =>
                    onPayGoal({
                      goal: g,
                      amount: Math.abs(t.amount),
                      date: t.date,
                      note: t.merchant,
                      transactionId: t.id,
                    })
                  }
                >
                  <GoalIcon goal={g} className="size-5 rounded-md" />
                  <span className="truncate">{g.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {(linked.length > 0 || countedFor) && (
        <div className="-mt-2 grid gap-1 text-xs text-muted-foreground">
          {countedFor && (
            <p className="flex items-center gap-1.5">
              <Repeat className="size-3.5" /> A charge for {countedFor.name}
              {countedByHand ? " (counted by hand)" : ""}
            </p>
          )}
          {linked.length > 0 && (
            <p className="flex items-center gap-1.5">
              <Target className="size-3.5" /> Counted toward{" "}
              {linked.map((g) => g.name).join(", ")}
            </p>
          )}
        </div>
      )}
    </>
  )
}
