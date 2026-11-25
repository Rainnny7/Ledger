import type { WorkPaymentDraft } from "@/components/work/dialogs/payment-dialog"
import { getDisplayCurrency } from "@/lib/format"

export function fillWorkPaymentFromDraft(draft: WorkPaymentDraft) {
  const target =
    draft.job.invoices.find((i) => i.id === draft.invoiceId) ??
    draft.job.invoices.filter((i) => i.status !== "paid").at(-1)
  const usual =
    draft.job.payAmount && target
      ? Math.min(draft.job.payAmount, target.remaining)
      : target?.remaining
  const home = getDisplayCurrency()
  return {
    invoiceId: target?.id ?? "",
    amount: draft.amount
      ? String(Math.abs(draft.amount))
      : usual
        ? String(usual)
        : "",
    date: draft.date ?? "",
    note: draft.note ?? "",
    converted: draft.job.currency !== home,
    receivedCurrency:
      home !== draft.job.currency
        ? home
        : draft.job.currency === "USD"
          ? "CAD"
          : "USD",
  }
}
