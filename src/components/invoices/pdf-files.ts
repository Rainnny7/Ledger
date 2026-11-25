import type { Invoice, PaymentMethod } from "@/lib/api"
import { safeFileName, shareUrl } from "@/lib/invoice"
import type { InvoicePdfSource } from "@/lib/invoice-pdf-data"

/** The PDF renderer (WebAssembly + font) only downloads the first time a PDF is needed. */
export const renderPdf = (source: InvoicePdfSource) =>
	import("@/lib/invoice-pdf").then((method) =>
		method.renderInvoicePdf(source)
	)

/** Everything the PDF needs from a saved invoice. */
export function pdfSource(
	inv: Invoice,
	methods: PaymentMethod[]
): InvoicePdfSource {
	const byId = new Map(methods.map((method) => [method.id, method]))
	return {
		invoice: inv,
		methods: inv.methodIds
			.map((id) => byId.get(id))
			.filter((m): m is PaymentMethod => !!m),
		paid: inv.paid,
		url: shareUrl(inv.token),
	}
}

/** `pdfFileName` helper or constant for this feature area. */
export const pdfFileName = (inv: Pick<Invoice, "number" | "client">) =>
	`${safeFileName(["Invoice", inv.number, inv.client.name].filter(Boolean).join(" "))}.pdf`

/** React/UI entry: `saveBlob`. */
export function saveBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = name
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
