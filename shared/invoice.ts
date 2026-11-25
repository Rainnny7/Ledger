import { fromCents, mulCents, mulMoney, toCents } from "./money.ts"

export interface InvoiceLine {
  description?: string
  quantity: number
  unitPrice: number
}

export function lineAmount(item: InvoiceLine) {
  return mulMoney(item.unitPrice, item.quantity)
}

/** Totals in decimal amounts; every step is whole cents (each line rounds once, tax rounds once). */
export function invoiceTotals(inv: {
  items: InvoiceLine[]
  taxRate: number
  discount: number
}) {
  const subtotal = inv.items.reduce(
    (s, i) => s + mulCents(toCents(i.unitPrice), i.quantity),
    0
  )
  const discount = Math.min(Math.max(0, toCents(inv.discount)), subtotal)
  const tax = mulCents(subtotal - discount, Math.max(0, inv.taxRate) / 100)
  return {
    subtotal: fromCents(subtotal),
    discount: fromCents(discount),
    tax: fromCents(tax),
    total: fromCents(subtotal - discount + tax),
  }
}
