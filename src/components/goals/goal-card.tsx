import { WithContextMenu } from "@/components/layout/app-context-menu"
import { AnimatedMoney } from "@/components/common/count-up"
import { Money } from "@/components/common/money"
import { MoreHorizontal, Plus } from "lucide-react"
import { useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { toast } from "sonner"
import {
  GoalBar,
  GoalIcon,
  GoalNudge,
  GoalRing,
  GoalStatusPill,
} from "@/components/goals/goal-bits"
import {
  goalCardMenuItems,
  type GoalCardActions,
} from "@/components/goals/goal-card-menu"
import { GoalCardPayments } from "@/components/goals/goal-card-payments"
import { ShareBadge } from "@/components/sharing/share-bits"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api, type Goal } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { cn } from "cn"

export type { GoalCardActions }

export function GoalCard({
  goal: g,
  ...actions
}: { goal: Goal } & GoalCardActions) {
  const owner = g.access === "owner"
  const canEdit = g.access !== "view"
  const [showAll, setShowAll] = useState(false)
  const payments = showAll ? g.payments : g.payments.slice(0, 3)
  const done = g.status === "done"
  const [focusParam] = useQueryState("focus", parseAsString.withDefault(""))
  const focused = focusParam.split(",").includes(g.id)
  const menuItems = goalCardMenuItems(g, actions, { done, canEdit, owner })

  async function removePayment(id: string) {
    try {
      await api.deleteGoalPayment(g.id, id)
      toast.success("Payment removed")
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <WithContextMenu menu={menuItems}>
      <Card
        className={cn("gap-0", focused && "ring-2 ring-primary/60")}
        data-focused={focused || undefined}
      >
        <CardHeader className="flex items-start gap-3">
          <GoalIcon goal={g} />
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <span className="truncate">{g.name}</span>
              <GoalStatusPill status={g.status} />
              <ShareBadge item={g} onClick={() => actions.onShare(g)} />
            </CardTitle>
            <CardDescription className="truncate">
              {g.kind === "payoff" ? "Paying off" : "Saving up"}
              {g.targetDate && ` · by ${formatDate(g.targetDate)}`}
              {done && g.completedAt && ` · done ${formatDate(g.completedAt)}`}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${g.name} options`}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{menuItems}</DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>

        <CardContent className="grid gap-4 pt-4">
          <div className="flex items-center gap-4">
            <GoalRing goal={g} />
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-semibold tabular-nums">
                <AnimatedMoney value={g.saved} currency={g.currency} />
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / <Money value={g.target} currency={g.currency} />
                </span>
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                <GoalNudge goal={g} />
              </p>
            </div>
            {!done && (
              <div className="shrink-0 text-right">
                <p className="text-lg font-semibold tabular-nums">
                  <Money value={g.remaining} currency={g.currency} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {g.kind === "payoff" ? "left to pay" : "left to save"}
                </p>
              </div>
            )}
          </div>
          <GoalBar goal={g} />

          {g.notes && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground italic">
              “{g.notes}”
            </p>
          )}

          {!done && !g.archived && canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => actions.onPay(g)}
              className="w-fit"
            >
              <Plus /> {g.kind === "payoff" ? "Log a payment" : "Add money"}
            </Button>
          )}

          <GoalCardPayments
            goal={g}
            payments={payments}
            showAll={showAll}
            canEdit={canEdit}
            onToggleShowAll={() => setShowAll((v) => !v)}
            onRemove={(id) => void removePayment(id)}
          />
        </CardContent>
      </Card>
    </WithContextMenu>
  )
}
