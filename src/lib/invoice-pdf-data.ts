import type { InvoicePdfData } from "@/components/pdf/blocks/invoice-shared/invoice-data"
import type { InvoiceInput, PublicPaymentMethod } from "./api"
import { formatDate } from "./format"
import {
  formatQty,
  formatRate,
  invoiceMoney,
  invoiceTotals,
  lineAmount,
  methodKind,
  methodLines,
  partyLines,
  payLink,
} from "./invoice"

/** What the PDF needs: the invoice as written, what's been paid, and the share link. */
export interface InvoicePdfSource {
  invoice: Omit<InvoiceInput, "methodIds" | "workInvoiceId">
  methods: PublicPaymentMethod[]
  paid?: number
  /** The share page; omitted on drafts that have never been saved. */
  url?: string | null
}

export function toPdfData({
  invoice: inv,
  methods,
  paid = 0,
  url,
}: InvoicePdfSource): InvoicePdfData {
  const money = (n: number) => invoiceMoney(n, inv.currency)
  const t = invoiceTotals(inv)
  const balance = Math.max(0, Math.round((t.total - paid) * 100) / 100)
  const totals: InvoicePdfData["totals"] = [
    { label: "Subtotal", value: money(t.subtotal) },
  ]
  if (t.discount > 0)
    totals.push({ label: "Discount", value: money(-t.discount) })
  if (inv.taxRate > 0)
    totals.push({
      label: `${inv.taxLabel || "Tax"} (${formatRate(inv.taxRate)})`,
      value: money(t.tax),
    })
  totals.push({ label: "Total", value: money(t.total), strong: paid === 0 })
  if (paid !== 0) {
    totals.push({ label: "Paid", value: money(-paid) })
    totals.push({ label: "Balance due", value: money(balance), strong: true })
  }
  const stamp =
    inv.status === "void" ? "VOID" : t.total > 0 && balance <= 0 ? "PAID" : null
  return {
    number: inv.number || "Draft",
    issueDate: formatDate(inv.issueDate),
    dueDate: inv.dueDate ? formatDate(inv.dueDate) : "On receipt",
    stamp,
    from: { name: inv.from.name, lines: partyLines(inv.from) },
    client: { name: inv.client.name, lines: partyLines(inv.client) },
    items: inv.items
      .filter((i) => i.description.trim() || i.unitPrice)
      .map((i) => ({
        description: i.description || "—",
        quantity: formatQty(i.quantity),
        unitPrice: money(i.unitPrice),
        amount: money(lineAmount(i)),
      })),
    totals,
    amountDue: money(paid ? balance : t.total),
    methods: methods.map((m) => {
      if (m.kind === "paypal-checkout") {
        return {
          label: m.label || "PayPal or card",
          lines: [
            {
              label: "Online",
              value: "Pay by PayPal or card from the invoice link",
            },
          ],
          qr: null,
          link: url ?? null,
        }
      }
      const link = payLink(m, balance, inv.currency)
      return {
        label: m.label || methodKind(m.kind).label,
        lines: methodLines(m),
        qr: m.kind === "crypto" ? m.fields.address?.trim() || null : null,
        link,
      }
    }),
    payUrl: url ?? null,
    notes: inv.notes?.trim() || null,
    terms: inv.terms?.trim() || null,
  }
}
