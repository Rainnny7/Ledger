/** Invoice line math shared by the editor and server totals validation. */
import { fromCents, mulCents, mulMoney, toCents } from "./money.ts"

/** One billable row on an invoice (qty × unit price). */
export interface InvoiceLine {
	description?: string
	quantity: number
	unitPrice: number
}

/** Extended price for one line (unit × quantity, rounded once to a cent). */
export function lineAmount(item: InvoiceLine) {
	return mulMoney(item.unitPrice, item.quantity)
}

/** Totals in decimal amounts; every step is whole cents (each line rounds once, tax rounds once). */
export function invoiceTotals(invoice: {
	items: InvoiceLine[]
	taxRate: number
	discount: number
}) {
	const subtotal = invoice.items.reduce(
		(sum, item) => sum + mulCents(toCents(item.unitPrice), item.quantity),
		0
	)
	const discount = Math.min(Math.max(0, toCents(invoice.discount)), subtotal)
	const tax = mulCents(
		subtotal - discount,
		Math.max(0, invoice.taxRate) / 100
	)
	return {
		subtotal: fromCents(subtotal),
		discount: fromCents(discount),
		tax: fromCents(tax),
		total: fromCents(subtotal - discount + tax),
	}
}
