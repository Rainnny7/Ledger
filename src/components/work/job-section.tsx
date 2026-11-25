import { WithContextMenu } from "@/components/layout/app-context-menu"
import { Money } from "@/components/common/money"
import type { ReactNode } from "react"
import {
  Briefcase,
  ChevronDown,
  Clock,
  HandCoins,
  MoreHorizontal,
  ReceiptText,
  X,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { tintStyle } from "@/components/goals/goal-meta"
import { ShareBadge } from "@/components/sharing/share-bits"
import { shortName } from "@/lib/sharing"
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
import { api, type WorkJob } from "@/lib/api"
import { demoMode } from "@/lib/demo"
import {
  formatDate,
  formatRelativeDate,
  formatShortDate,
  isoDate,
} from "@/lib/format"
import { cn } from "cn"
import { formatDuration, formatHours, payEveryLabel } from "@/lib/work"
import type { JobActions } from "@/components/work/job-actions"
import { InvoiceCard } from "@/components/work/invoice-card"
import { JobMenu } from "@/components/work/job-menu"

const fail = (err: unknown) => toast.error((err as Error).message)
const readOnly = () =>
  toast.error("Demo mode is read-only. Exit demo mode to make changes.")

async function removeEntry(id: string) {
  if (demoMode) return readOnly()
  try {
    await api.deleteWorkEntry(id)
    toast.success("Shift removed")
  } catch (err) {
    fail(err)
  }
}

export function JobSection({
  job: j,
  ...actions
}: { job: WorkJob } & JobActions) {
  const [showPaid, setShowPaid] = useState(false)
  const openBills = j.invoices.filter((i) => i.status !== "paid")
  const paidBills = j.invoices.filter((i) => i.status === "paid")
  const owner = j.access === "owner"
  const readonly = j.access === "view"

  const menuProps = { job: j, readonly, owner, actions }

  return (
    <WithContextMenu menu={<JobMenu {...menuProps} />}>
      <Card className="@container min-w-0 gap-0">
        <CardHeader className="flex items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl"
            style={tintStyle(j.color)}
          >
            <Briefcase className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <span className="truncate">{j.name}</span>
              <ShareBadge item={j} onClick={() => actions.onShare(j)} />
            </CardTitle>
            <CardDescription className="truncate">
              <Money value={j.rate} currency={j.currency} />
              /hr
              {j.payAmount && j.payEveryDays ? (
                <>
                  {" · paid "}
                  <Money value={j.payAmount} currency={j.currency} />{" "}
                  {payEveryLabel(j.payEveryDays)}
                </>
              ) : null}
            </CardDescription>
          </div>
          {!readonly && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${j.name} options`}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <JobMenu {...menuProps} />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardHeader>

        <CardContent className="grid gap-5 pt-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">
                {j.owner ? `Owed to ${shortName(j.owner)}` : "Owed to you"}
              </p>
              <p className="text-3xl font-semibold tabular-nums">
                <Money value={j.owed} currency={j.currency} />
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {jobNudge(j)}
              </p>
            </div>
            {!readonly && !j.archived && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => actions.onLog(j)}>
                  <Clock /> Log hours
                </Button>
                <Button variant="outline" onClick={() => actions.onBill(j)}>
                  <ReceiptText /> Bill hours
                  {j.unbilledHours > 0 && (
                    <span className="text-muted-foreground tabular-nums">
                      · {formatHours(j.unbilledHours)}h
                    </span>
                  )}
                </Button>
                <Button onClick={() => actions.onPay(j)} disabled={j.owed <= 0}>
                  <HandCoins /> Record payment
                </Button>
              </div>
            )}
          </div>

          {j.notes && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {j.notes}
            </p>
          )}

          {j.unbilled.length > 0 && (
            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground uppercase">
                  Not billed yet
                </h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDuration(j.unbilledHours)} ·{" "}
                  <Money value={j.unbilledValue} currency={j.currency} />
                </span>
              </div>
              <ul className="grid text-sm">
                {j.unbilled.map((e) => (
                  <li
                    key={e.id}
                    className="group flex items-center gap-2 rounded-md px-2 py-1 odd:bg-muted/40"
                  >
                    <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
                      {formatShortDate(e.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {e.note}
                    </span>
                    <span className="tabular-nums">
                      {formatDuration(e.hours)}
                    </span>
                    {owner && (
                      <button
                        type="button"
                        aria-label="Remove shift"
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                        onClick={() => void removeEntry(e.id)}
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {openBills.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-3">
              {openBills.map((inv) => (
                <InvoiceCard key={inv.id} job={j} invoice={inv} {...actions} />
              ))}
            </div>
          )}

          {j.invoices.length === 0 && j.unbilled.length === 0 && (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Log shifts as you work them, or jump straight to{" "}
              <span className="font-medium text-foreground">Bill hours</span>{" "}
              when you send your total.
            </p>
          )}

          {paidBills.length > 0 && (
            <div className="grid gap-3">
              <button
                type="button"
                className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setShowPaid((v) => !v)}
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    !showPaid && "-rotate-90"
                  )}
                />
                Paid bills ({paidBills.length}) ·{" "}
                <Money
                  value={paidBills.reduce((s, i) => s + i.total, 0)}
                  currency={j.currency}
                />
              </button>
              {showPaid && (
                <div className="grid animate-in grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-3 duration-200 fade-in-0">
                  {paidBills.map((inv) => (
                    <InvoiceCard
                      key={inv.id}
                      job={j}
                      invoice={inv}
                      {...actions}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </WithContextMenu>
  )
}

function jobNudge(j: WorkJob): ReactNode {
  if (j.owed <= 0)
    return j.unbilledHours > 0
      ? `${formatDuration(j.unbilledHours)} ready to bill`
      : "All paid up"
  if (j.payoffDate && j.paymentsLeft) {
    const next =
      j.nextPaymentDate === isoDate()
        ? "next one due today"
        : `next ${formatShortDate(j.nextPaymentDate!)}`
    return `${j.paymentsLeft} more payment${j.paymentsLeft === 1 ? "" : "s"} · ${next} · cleared by ${formatDate(j.payoffDate)}`
  }
  return j.lastPaymentDate ? (
    `Last paid ${formatRelativeDate(j.lastPaymentDate)}`
  ) : (
    <>
      Billed <Money value={j.billedTotal} currency={j.currency} /> so far
    </>
  )
}
