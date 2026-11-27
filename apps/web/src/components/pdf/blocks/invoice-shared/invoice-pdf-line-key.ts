import type { InvoicePdfData } from "@/components/pdf/blocks/invoice-shared/invoice-data"

/**
 * Stable React key for a PDF invoice line item row.
 */
export function invoicePdfLineKey(
	item: InvoicePdfData["items"][number],
	itemIndex: number
): string {
	return `${itemIndex}-${item.description}-${item.quantity}-${item.unitPrice}`
}
