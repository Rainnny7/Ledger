import { Money } from "@/components/money"
import { ArrowRight, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router"
import {
  GoalBar,
  GoalIcon,
  goalNudge,
  GoalStatusPill,
} from "@/components/goal-bits"
import { GoalPaymentDialog, type PaymentDraft } from "@/components/goal-dialogs"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatMoney } from "@/lib/format"
import { useConverter } from "@/lib/currency"
import { useGoals } from "@/lib/queries"
import { cn } from "@/lib/utils"

const RANK = {
  overdue: 0,
  behind: 1,
  "on-track": 2,
  ahead: 3,
  "no-date": 4,
  done: 5,
} as const

/** The dashboard's goals strip: open goals with one-tap payments. Renders nothing when there are none. */
export function GoalsSpotlight() {
  const { data } = useGoals()
  const [paying, setPaying] = useState<PaymentDraft | null>(null)
  const fx = useConverter()
  const open = useMemo(
    () =>
      (data?.goals ?? [])
        // Ones you can add money to: yours, or shared with you for editing.
        .filter(
          (g) => !g.archived && g.status !== "done" && g.access !== "view"
        )
        .sort(
          (a, b) =>
            RANK[a.status] - RANK[b.status] ||
            (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999")
        ),
    [data]
  )
  if (open.length === 0) return null

  const shown = open.slice(0, 3)
  const saved = fx.sum(open.map((g) => [g.saved, g.currency]))
  const target = fx.sum(open.map((g) => [g.target, g.currency]))
  const left = fx.sum(open.map((g) => [g.remaining, g.currency]))

  return (
    <section
      aria-label="Your goals"
      className="animate-[ledger-rise_420ms_ease-out_both] rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold">Your goals</h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatMoney(saved)} of {formatMoney(target)} · {formatMoney(left)}{" "}
            left
          </span>
        </div>
        <Link
          to="/goals"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-mr-2 text-muted-foreground"
          )}
        >
          {open.length > shown.length
            ? `All ${open.length} goals`
            : "View goals"}{" "}
          <ArrowRight />
        </Link>
      </div>

      <div
        className={cn(
          "grid gap-3",
          shown.length > 1 && "md:grid-cols-2",
          shown.length > 2 && "lg:grid-cols-3"
        )}
      >
        {shown.map((g) => (
          <div
            key={g.id}
            className="flex flex-col gap-2.5 rounded-lg bg-muted/40 p-3"
          >
            <div className="flex items-center gap-3">
              <GoalIcon goal={g} className="size-9" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{g.name}</span>
                  <GoalStatusPill status={g.status} />
                </div>
                <p className="text-sm tabular-nums">
                  <span className="font-semibold">
                    <Money value={g.saved} currency={g.currency} />
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    / <Money value={g.target} currency={g.currency} />
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · <Money value={g.remaining} currency={g.currency} /> left
                  </span>
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Add to ${g.name}`}
                onClick={() => setPaying({ goal: g })}
              >
                <Plus />
              </Button>
            </div>
            <GoalBar goal={g} className="h-1.5" />
            <p className="truncate text-xs text-muted-foreground">
              {goalNudge(g)}
            </p>
          </div>
        ))}
      </div>
      <GoalPaymentDialog draft={paying} onClose={() => setPaying(null)} />
    </section>
  )
}
