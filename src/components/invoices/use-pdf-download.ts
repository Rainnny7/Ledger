import { useMutation } from "@tanstack/react-query"
import type { InvoicePdfSource } from "@/lib/invoice-pdf-data"
import { notifyFailure } from "@/components/invoices/notify"
import { renderPdf, saveBlob } from "@/components/invoices/pdf-files"

/**
 * Draw an invoice's PDF and save it. A mutation owns the pending flag, so a slow draw finishing
 * late can't clear the state of a newer one.
 */
export function usePdfDownload() {
	return useMutation({
		mutationFn: async ({
			source,
			name,
		}: {
			source: InvoicePdfSource
			name: string
		}) => saveBlob(await renderPdf(source), name),
		onError: notifyFailure,
	})
}
