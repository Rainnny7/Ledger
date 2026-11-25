import type { Invoice, InvoiceInput, InvoiceParty, WorkJob } from "@/lib/api"
import type { InvoicesData } from "@/lib/api"
import { addDays, daysFromToday, formatShortDate, isoDate } from "@/lib/format"
import { EMPTY_PARTY } from "@/lib/invoice"
import { mulMoney, roundMoney, roundTo } from "../../../../shared/money.ts"
import { formatHours } from "@/lib/work"

/** Line items as typed: numbers stay strings until saved, so "1." or "" don't jump around. */
export interface ItemDraft {
  key: number
  description: string
  quantity: string
  unitPrice: string
}

export type Draft = Omit<InvoiceInput, "items"> & { items: ItemDraft[] }

let itemKey = 0
export const newItem = (
  description = "",
  quantity = "1",
  unitPrice = ""
): ItemDraft => ({
  key: ++itemKey,
  description,
  quantity,
  unitPrice,
})

export const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

export const decimal = (s: string) =>
  s
    .replace(/[^\d.-]/g, "")
    .replace(/(?!^)-/g, "")
    .replace(/(\..*)\./g, "$1")

export const toItems = (items: ItemDraft[]) =>
  items
    .filter((i) => i.description.trim() || num(i.unitPrice))
    .map((i) => ({
      description: i.description.trim(),
      quantity: roundTo(num(i.quantity), 3),
      unitPrice: roundMoney(num(i.unitPrice)),
    }))

export const DUE_PRESETS = [
  { days: 0, label: "On receipt" },
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
] as const

/** A fresh invoice from your saved details, a copy of another one, or a Work bill. */
export function startDraft(
  data: InvoicesData,
  opts: { source?: Invoice; bill?: { job: WorkJob; billId: string } }
): Draft {
  const p = data.profile
  const today = isoDate()
  const defaults = data.methods.filter((m) => m.isDefault).map((m) => m.id)
  const base: Draft = {
    number: data.nextNumber,
    status: "draft",
    template: p.template,
    theme: p.theme,
    currency: p.currency,
    issueDate: today,
    dueDate: p.dueDays === null ? null : addDays(today, p.dueDays),
    from: p.from,
    client: EMPTY_PARTY,
    items: [newItem()],
    taxRate: p.taxRate,
    taxLabel: p.taxLabel,
    discount: 0,
    notes: p.notes || null,
    terms: p.terms || null,
    methodIds: defaults,
    workInvoiceId: null,
  }
  const src = opts.source
  if (src) {
    const span = src.dueDate
      ? Math.max(0, -daysFromToday(src.dueDate) + daysFromToday(src.issueDate))
      : null
    return {
      ...base,
      ...src,
      number: data.nextNumber,
      status: "draft",
      issueDate: today,
      dueDate: span === null ? null : addDays(today, span),
      items: src.items.map((i) =>
        newItem(i.description, String(i.quantity), String(i.unitPrice))
      ),
      workInvoiceId: null,
    }
  }
  const bill =
    opts.bill && opts.bill.job.invoices.find((b) => b.id === opts.bill!.billId)
  if (opts.bill && bill) {
    const { job } = opts.bill
    const agreed =
      Math.abs(bill.total - mulMoney(bill.rate, bill.hours)) > 0.005
    const what = `${job.name}: ${formatHours(bill.hours)} hrs${bill.note ? ` (${bill.note})` : ""}, up to ${formatShortDate(bill.date)}`
    return {
      ...base,
      currency: job.currency,
      client: { ...EMPTY_PARTY, name: job.name },
      items: agreed
        ? [newItem(what, "1", String(bill.total))]
        : [newItem(what, String(bill.hours), String(bill.rate))],
      workInvoiceId: bill.id,
    }
  }
  return base
}

/** People you've billed before, newest first, for one-tap filling. */
export function recentClients(invoices: Invoice[]): InvoiceParty[] {
  const seen = new Map<string, InvoiceParty>()
  for (const inv of invoices)
    if (inv.client.name && !seen.has(inv.client.name.toLowerCase()))
      seen.set(inv.client.name.toLowerCase(), inv.client)
  return [...seen.values()].slice(0, 6)
}
