/**
 * Invoices you send: line items × quantity, an optional discount and tax, then payments until
 * the balance is cleared. Pure helpers here; storage lives in routes/invoices.ts.
 */

export interface Party {
  name: string
  email: string
  phone: string
  /** Free-form, one line per row. */
  address: string
  /** GST/HST, VAT or business number, shown under your name. */
  taxId: string
}

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
}

export type InvoiceStatus = 'draft' | 'sent' | 'void'
export type PayState = 'unpaid' | 'partial' | 'paid'

/** Everything a client can be offered. `paypal-checkout` takes card/PayPal through the user's own PayPal REST app. */
export const PAYMENT_METHOD_KINDS = [
  'etransfer',
  'paypal',
  'paypal-checkout',
  'crypto',
  'bank',
  'wise',
  'venmo',
  'cashapp',
  'zelle',
  'revolut',
  'link',
  'cheque',
  'cash',
  'other',
] as const
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number]

export const round2 = (n: number) => Math.round(n * 100) / 100

export function invoiceTotals(inv: { items: InvoiceItem[]; taxRate: number; discount: number }) {
  const subtotal = round2(inv.items.reduce((s, i) => s + round2(i.quantity * i.unitPrice), 0))
  const discount = round2(Math.min(Math.max(0, inv.discount), subtotal))
  const tax = round2(((subtotal - discount) * Math.max(0, inv.taxRate)) / 100)
  return { subtotal, discount, tax, total: round2(subtotal - discount + tax) }
}

export function payState(total: number, paid: number): PayState {
  if (total - paid <= 0.005 && (paid > 0 || total === 0)) return 'paid'
  return paid > 0 ? 'partial' : 'unpaid'
}

/** "INV-0007" → "INV-0008"; keeps the padding. Starts at <prefix>0001 when nothing matches. */
export function nextInvoiceNumber(existing: string[], prefix = 'INV-') {
  let best = 0
  let width = 0
  for (const n of existing) {
    const m = /^(.*?)(\d+)$/.exec(n.trim())
    if (!m || m[1] !== prefix) continue
    const v = Number(m[2])
    if (v > best) {
      best = v
      width = m[2].length
    }
  }
  return `${prefix}${String(best + 1).padStart(width || 4, '0')}`
}
