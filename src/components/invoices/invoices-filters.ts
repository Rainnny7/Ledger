import type { InvoiceState } from "@/components/invoices/invoice-state"

export type InvoiceFilter = "all" | "unpaid" | "paid" | "draft"

export const INVOICE_FILTERS: {
  value: InvoiceFilter
  label: string
  match: (s: InvoiceState) => boolean
}[] = [
  { value: "all", label: "All", match: () => true },
  {
    value: "unpaid",
    label: "Unpaid",
    match: (s) =>
      s === "sent" || s === "viewed" || s === "overdue" || s === "partial",
  },
  { value: "paid", label: "Paid", match: (s) => s === "paid" },
  { value: "draft", label: "Drafts", match: (s) => s === "draft" },
]
