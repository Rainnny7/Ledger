import { WithContextMenu } from "@/components/layout/app-context-menu"
import { confirmDialog } from "@/lib/confirm"
import { Money } from "@/components/common/money"
import { Hint } from "@/components/common/hint"
import { Copy, ExternalLink, Link2, MoreHorizontal, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { accentStyle } from "@/components/goals/goal-meta"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  api,
  type InvoiceStatus,
  type WorkInvoice,
  type WorkJob,
} from "@/lib/api"
import { demoMode } from "@/lib/demo"
import { formatMoney, formatShortDate } from "@/lib/format"
import { cn } from "cn"
import { formatHours, invoiceText, paymentLine } from "@/lib/work"
import type { JobActions } from "@/components/work/job-actions"
import { BillMenu } from "@/components/work/bill-menu"
import { copyForChat } from "@/components/work/copy-toast"

const fail = (err: unknown) => toast.error((err as Error).message)
const readOnly = () =>
  toast.error("Demo mode is read-only. Exit demo mode to make changes.")

async function removePayment(id: string) {
  if (demoMode) return readOnly()
  try {
    await api.deleteWorkPayment(id)
    toast.success("Payment removed")
  } catch (err) {
    fail(err)
  }
}

const STATUS: Record<InvoiceStatus, { label: string; className: string }> = {
  unpaid: {
    label: "Unpaid",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  partial: {
    label: "Paying off",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  paid: {
    label: "Paid",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
}

export function InvoiceCard({
  job: j,
  invoice: inv,
  onBill,
  onPay,
}: { job: WorkJob; invoice: WorkInvoice } & JobActions) {
  const money = (n: number) => formatMoney(n, j.currency)
  const status = STATUS[inv.status]
  const [showAll, setShowAll] = useState(false)
  const payments = inv.payments.toReversed()
  const shown = showAll ? payments : payments.slice(0, 4)
  const readonly = j.access === "view"
  const owner = j.access === "owner"

  async function remove() {
    const n = inv.payments.length
    if (
      !(await confirmDialog({
        title: `Delete this ${money(inv.total)} bill?`,
        description: `${n ? `Its ${n} payment${n === 1 ? "" : "s"} are deleted too. ` : ""}Logged shifts on it go back to “not billed”.`,
        action: "Delete bill",
        destructive: true,
      }))
    )
      return
    try {
      await api.deleteWorkInvoice(inv.id)
      toast.success("Bill deleted")
    } catch (err) {
      fail(err)
    }
  }

  const billMenuProps = {
    job: j,
    invoice: inv,
    onPay,
    onBill,
    onRemove: owner ? () => void remove() : undefined,
  }

  const contextMenu = (
    <>
      <DropdownMenuItem
        onClick={() => void copyForChat(invoiceText(inv, j.currency), "Bill")}
      >
        <Copy /> Copy as a message
      </DropdownMenuItem>
      {!readonly && (
        <>
          <DropdownMenuSeparator />
          <BillMenu {...billMenuProps} />
        </>
      )}
    </>
  )

  return (
    <WithContextMenu menu={contextMenu}>
      <div className="@container/bill grid min-w-0 gap-3 rounded-xl border p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              Billed {formatShortDate(inv.date)}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  status.className
                )}
              >
                {status.label}
              </span>
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatHours(inv.hours)} hrs ×{" "}
              <Money value={inv.rate} currency={j.currency} />
              {Math.abs(
                inv.total - Math.round(inv.hours * inv.rate * 100) / 100
              ) > 0.005 && " (agreed total)"}
              {inv.counterHours !== null &&
                ` · tracker at ${formatHours(inv.counterHours)}`}
            </p>
          </div>
          <Hint label="Copy as a message">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Copy for chat"
              onClick={() =>
                void copyForChat(invoiceText(inv, j.currency), "Bill")
              }
            >
              <Copy />
            </Button>
          </Hint>
          {!readonly && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Bill options"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <BillMenu {...billMenuProps} />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="grid min-w-0 gap-3 @xl/bill:grid-cols-2 @xl/bill:gap-x-6">
          <div className="grid min-w-0 content-start gap-3">
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 tabular-nums">
                <span className="text-xl font-semibold">
                  <Money
                    value={inv.status === "paid" ? inv.total : inv.remaining}
                    currency={j.currency}
                  />
                </span>
                <span className="text-xs text-muted-foreground">
                  {inv.status === "paid" ? (
                    `paid ${inv.paidAt ? formatShortDate(inv.paidAt) : ""}`
                  ) : (
                    <>
                      left of <Money value={inv.total} currency={j.currency} />
                    </>
                  )}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.round(inv.progress * 100)}%`,
                    ...accentStyle(j.color),
                  }}
                />
              </div>
              {inv.overpaid > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Overpaid by{" "}
                  <Money value={inv.overpaid} currency={j.currency} />
                </p>
              )}
            </div>

            {(inv.proofUrl || inv.note) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {inv.proofUrl && (
                  <a
                    href={inv.proofUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" /> Proof
                  </a>
                )}
                {inv.note && (
                  <span className="min-w-0 break-words whitespace-pre-line">
                    {inv.note}
                  </span>
                )}
              </div>
            )}
          </div>

          {payments.length > 0 && (
            <div className="grid min-w-0 content-start gap-1">
              <ul className="grid text-sm">
                {shown.map((p) => (
                  <li
                    key={p.id}
                    className="group flex items-center gap-2 rounded-md px-2 py-1 odd:bg-muted/40"
                  >
                    <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
                      {formatShortDate(p.date)}
                    </span>
                    <span className="shrink-0 text-emerald-600 tabular-nums dark:text-emerald-400">
                      +<Money value={p.amount} currency={j.currency} />
                    </span>
                    {p.receivedAmount && p.receivedCurrency && (
                      <Hint
                        label={`Landed as ${formatMoney(p.receivedAmount, p.receivedCurrency)} ${p.receivedCurrency} · 1 ${j.currency} = ${(p.receivedAmount / p.amount).toFixed(4)} ${p.receivedCurrency}`}
                      >
                        <span className="shrink-0 cursor-default text-xs text-muted-foreground tabular-nums">
                          → {formatMoney(p.receivedAmount, p.receivedCurrency)}
                        </span>
                      </Hint>
                    )}
                    <span className="flex min-w-0 flex-1 items-center justify-end gap-1 truncate text-xs text-muted-foreground tabular-nums">
                      {p.transactionId && (
                        <Link2
                          className="size-3 shrink-0"
                          aria-label="Linked to a transaction"
                        />
                      )}
                      {p.remainingAfter > 0 ? (
                        <>
                          <Money
                            value={p.remainingAfter}
                            currency={j.currency}
                          />{" "}
                          left
                        </>
                      ) : (
                        "cleared"
                      )}
                    </span>
                    <Hint label={`Copy: ${paymentLine(p, j.currency)}`}>
                      <button
                        type="button"
                        aria-label="Copy update"
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                        onClick={() =>
                          void copyForChat(paymentLine(p, j.currency), "Update")
                        }
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </Hint>
                    {owner && (
                      <button
                        type="button"
                        aria-label="Remove payment"
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                        onClick={() => void removePayment(p.id)}
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {payments.length > 4 && (
                <button
                  type="button"
                  className="w-fit text-xs font-medium text-primary hover:underline"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "Show less" : `Show all ${payments.length}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </WithContextMenu>
  )
}
