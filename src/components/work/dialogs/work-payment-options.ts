import type { WorkJob } from "@/lib/api"
import { formatMoney, formatShortDate } from "@/lib/format"

export function openWorkInvoices(job: WorkJob) {
  return job.invoices.filter((i) => i.status !== "paid").toReversed()
}

export function workPaymentSelectItems(
  job: WorkJob,
  open: ReturnType<typeof openWorkInvoices>
) {
  return open.map((i) => ({
    value: i.id,
    label: `${formatShortDate(i.date)} · ${formatMoney(i.remaining, job.currency)} left of ${formatMoney(i.total, job.currency)}`,
  }))
}

export function workPaymentQuickAmounts(
  job: WorkJob | undefined,
  invoice: { remaining: number } | undefined
) {
  if (!invoice) return []
  return [
    job?.payAmount &&
      job.payAmount < invoice.remaining && {
        label: "Usual",
        value: job.payAmount,
      },
    { label: "The rest", value: invoice.remaining },
  ].filter((q): q is { label: string; value: number } => !!q && q.value > 0)
}
