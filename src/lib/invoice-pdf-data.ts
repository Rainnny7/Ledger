import type { InvoicePdfData } from "@/components/pdf/blocks/invoice-shared/invoice-data"
import type { InvoiceInput, PublicPaymentMethod } from "./api"
import { formatDate } from "./format"
import { invoiceTotals, lineAmount } from "../../shared/invoice.ts"
import {
	formatQty,
	formatRate,
	invoiceMoney,
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

/** `toPdfData` for this feature area. */
export function toPdfData({
	invoice: inv,
	methods,
	paid = 0,
	url,
}: InvoicePdfSource): InvoicePdfData {
	const formatLine = (amount: number) => invoiceMoney(amount, inv.currency)
	const computed = invoiceTotals(inv)
	const balance = Math.max(0, Math.round((computed.total - paid) * 100) / 100)
	const totals: InvoicePdfData["totals"] = [
		{ label: "Subtotal", value: formatLine(computed.subtotal) },
	]
	if (computed.discount > 0) {
		totals.push({
			label: "Discount",
			value: formatLine(-computed.discount),
		})
	}
	if (inv.taxRate > 0) {
		totals.push({
			label: `${inv.taxLabel || "Tax"} (${formatRate(inv.taxRate)})`,
			value: formatLine(computed.tax),
		})
	}
	totals.push({
		label: "Total",
		value: formatLine(computed.total),
		strong: paid === 0,
	})
	if (paid !== 0) {
		totals.push({ label: "Paid", value: formatLine(-paid) })
		totals.push({
			label: "Balance due",
			value: formatLine(balance),
			strong: true,
		})
	}
	const stamp =
		inv.status === "void"
			? "VOID"
			: computed.total > 0 && balance <= 0
				? "PAID"
				: null
	return {
		number: inv.number || "Draft",
		issueDate: formatDate(inv.issueDate),
		dueDate: inv.dueDate ? formatDate(inv.dueDate) : "On receipt",
		stamp,
		from: { name: inv.from.name, lines: partyLines(inv.from) },
		client: { name: inv.client.name, lines: partyLines(inv.client) },
		items: inv.items
			.filter((item) => item.description.trim() || item.unitPrice)
			.map((item) => ({
				description: item.description || "—",
				quantity: formatQty(item.quantity),
				unitPrice: formatLine(item.unitPrice),
				amount: formatLine(lineAmount(item)),
			})),
		totals,
		amountDue: formatLine(paid ? balance : computed.total),
		methods: methods.map((method) => {
			if (method.kind === "paypal-checkout") {
				return {
					label: method.label || "PayPal or card",
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
			const link = payLink(method, balance, inv.currency)
			return {
				label: method.label || methodKind(method.kind).label,
				lines: methodLines(method),
				qr:
					method.kind === "crypto"
						? method.fields.address?.trim() || null
						: null,
				link,
			}
		}),
		payUrl: url ?? null,
		notes: inv.notes?.trim() || null,
		terms: inv.terms?.trim() || null,
	}
}
