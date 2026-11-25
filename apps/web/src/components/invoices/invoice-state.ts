import type { Invoice } from "@/lib/api"
import { daysFromToday, formatShortDate } from "@/lib/format"

/** Shape for `InvoiceState` used across this module. */
export type InvoiceState =
	| "draft"
	| "sent"
	| "viewed"
	| "overdue"
	| "partial"
	| "paid"
	| "void"

/** React/UI entry: `invoiceState`. */
export function invoiceState(inv: Invoice): InvoiceState {
	if (inv.status === "void") {
		return "void"
	}
	if (inv.payState === "paid") {
		return "paid"
	}
	if (inv.status === "draft") {
		return "draft"
	}
	if (inv.dueDate && daysFromToday(inv.dueDate) < 0) {
		return "overdue"
	}
	if (inv.payState === "partial") {
		return "partial"
	}
	return inv.viewedAt ? "viewed" : "sent"
}

/** When it was paid, issued or is due, for a row in the invoice list. */
export function dueLabel(inv: Invoice, state: InvoiceState) {
	const due = inv.dueDate ? daysFromToday(inv.dueDate) : null
	if (state === "paid") {
		return `Paid ${formatShortDate(inv.payments.at(-1)?.date ?? inv.issueDate)}`
	}
	if (state === "void" || state === "draft" || due === null) {
		return `Issued ${formatShortDate(inv.issueDate)}`
	}
	if (due < 0) {
		return `${-due} day${due === -1 ? "" : "s"} overdue`
	}
	if (due === 0) {
		return "Due today"
	}
	return `Due ${formatShortDate(inv.dueDate!)}`
}

/** The amount a list row leads with: what's left when part-paid or late, otherwise the total. */
export const rowAmount = (inv: Invoice, state: InvoiceState) =>
	state === "partial" || state === "overdue" ? inv.balance : inv.total
