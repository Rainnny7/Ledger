import { fail } from "@/components/work/dialogs/form"
import { roundMoney } from "../../../../shared/money.ts"
import { api, type WorkJob } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { copyText, paymentLine } from "@/lib/work"
import { Copy } from "lucide-react"
import { toast } from "sonner"

export async function saveWorkPayment(opts: {
  job: WorkJob
  invoiceId: string
  invoicePayments: { id: string }[]
  value: number
  date: string
  note: string
  transactionId: string | null | undefined
  converted: boolean
  receivedN: number
  receivedCurrency: string
}) {
  const before = new Set(opts.invoicePayments.map((p) => p.id))
  const { job: updated } = await api.addWorkPayment(opts.invoiceId, {
    amount: roundMoney(opts.value),
    date: opts.date,
    note: opts.note.trim() || null,
    transactionId: opts.transactionId ?? null,
    ...(opts.converted &&
    opts.receivedN > 0 &&
    opts.receivedCurrency !== opts.job.currency
      ? {
          receivedAmount: roundMoney(opts.receivedN),
          receivedCurrency: opts.receivedCurrency,
        }
      : {}),
  })
  const inv = updated.invoices.find((i) => i.id === opts.invoiceId)
  const added = inv?.payments.find((p) => !before.has(p.id))
  const line = added ? paymentLine(added, opts.job.currency) : null
  const cleared = inv?.status === "paid"
  toast.success(
    cleared
      ? `🎉 Bill cleared — ${formatMoney(inv!.total, opts.job.currency)} paid in full`
      : `${formatMoney(opts.value, opts.job.currency)} received`,
    {
      description: cleared
        ? undefined
        : `${formatMoney(inv?.remaining ?? 0, opts.job.currency)} left on this bill`,
      duration: 8000,
      action: line
        ? {
            label: (
              <span className="flex items-center gap-1">
                <Copy className="size-3" /> Copy update
              </span>
            ),
            onClick: () =>
              void copyText(line).then((ok) =>
                ok
                  ? toast.success("Copied", { description: line })
                  : toast.error("Couldn’t copy")
              ),
          }
        : undefined,
    }
  )
}

export async function runWorkPaymentSave(
  ...args: Parameters<typeof saveWorkPayment>
) {
  try {
    await saveWorkPayment(...args)
    return true
  } catch (err) {
    fail(err)
    return false
  }
}
