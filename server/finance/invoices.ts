/**
 * Invoices you send: line items × quantity, an optional discount and tax, then payments until
 * the balance is cleared. Pure helpers here; storage lives in finance/invoice-store.ts.
 */

import { toCents } from "../../shared/money.ts"

/** Shape of Party as stored and returned by the API. */
export interface Party {
	name: string
	email: string
	phone: string
	/** Free-form, one line per row. */
	address: string
	/** GST/HST, VAT or business number, shown under your name. */
	taxId: string
}

/** Shape of InvoiceItem as stored and returned by the API. */
export interface InvoiceItem {
	description: string
	quantity: number
	unitPrice: number
}

/** InvoiceStatus values accepted by validation and routes. */
export type InvoiceStatus = "draft" | "sent" | "void"
/** PayState values accepted by validation and routes. */
export type PayState = "unpaid" | "partial" | "paid"

/** Everything a client can be offered. `paypal-checkout` takes card/PayPal through the user's own PayPal REST app. */
export const PAYMENT_METHOD_KINDS = [
	"etransfer",
	"paypal",
	"paypal-checkout",
	"crypto",
	"bank",
	"wise",
	"venmo",
	"cashapp",
	"zelle",
	"revolut",
	"link",
	"cheque",
	"cash",
	"other",
] as const
/** PaymentMethodKind values accepted by validation and routes. */
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number]

/** Derives paid/partial/unpaid from totals in cents. */
export function payState(total: number, paid: number): PayState {
	if (toCents(total) - toCents(paid) <= 0 && (paid > 0 || total === 0)) {
		return "paid"
	}
	return paid > 0 ? "partial" : "unpaid"
}

/** "INV-0007" → "INV-0008"; keeps the padding. Starts at <prefix>0001 when nothing matches. */
export function nextInvoiceNumber(existing: string[], prefix = "INV-") {
	let best = 0
	let width = 0
	for (const existingNumber of existing) {
		const match = /^(.*?)(\d+)$/.exec(existingNumber.trim())
		if (!match || match[1] !== prefix) {
			continue
		}
		const numericValue = Number(match[2])
		if (numericValue > best) {
			best = numericValue
			width = match[2].length
		}
	}
	return `${prefix}${String(best + 1).padStart(width || 4, "0")}`
}
