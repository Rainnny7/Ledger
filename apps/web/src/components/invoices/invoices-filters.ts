import type { InvoiceState } from "@/components/invoices/invoice-state"

/** Shape for `InvoiceFilter` used across this module. */
export type InvoiceFilter = "all" | "unpaid" | "paid" | "draft"

/** `INVOICE_FILTERS:` helper or constant for this feature area. */
export const INVOICE_FILTERS: {
	value: InvoiceFilter
	label: string
	match: (state: InvoiceState) => boolean
}[] = [
	{ value: "all", label: "All", match: () => true },
	{
		value: "unpaid",
		label: "Unpaid",
		match: (state) =>
			state === "sent" ||
			state === "viewed" ||
			state === "overdue" ||
			state === "partial",
	},
	{ value: "paid", label: "Paid", match: (state) => state === "paid" },
	{ value: "draft", label: "Drafts", match: (state) => state === "draft" },
]
