import type { PublicInvoice } from "@/lib/api"
import { usePdfDownload } from "@/components/invoices/use-pdf-download"
import { PublicMethodCard } from "@/components/invoices/public/method-card"
import { PublicInvoiceViewDetails } from "@/components/invoices/public/public-invoice-view-details"
import { PublicInvoiceViewSummary } from "@/components/invoices/public/public-invoice-view-summary"

/** React/UI entry: `PublicInvoiceView`. */
export function PublicInvoiceView({
	invoice,
	token,
	capturing,
}: {
	invoice: PublicInvoice
	token: string
	capturing: boolean
}) {
	const downloadPdf = usePdfDownload()
	const paid = invoice.payState === "paid"
	const isVoid = invoice.status === "void"
	const methods = invoice.methods

	return (
		<>
			<PublicInvoiceViewSummary
				invoice={invoice}
				methods={methods}
				capturing={capturing}
				downloadPdf={downloadPdf}
			/>

			{!paid && !isVoid && methods.length > 0 && (
				<section className="grid gap-3">
					<h2 className="text-sm font-semibold">How to Pay</h2>
					<div className="grid gap-3 sm:grid-cols-2">
						{methods.map((method) => (
							<PublicMethodCard
								key={method.id}
								method={method}
								invoice={invoice}
								token={token}
							/>
						))}
					</div>
					<p className="text-xs text-muted-foreground">
						Please include “{invoice.number}” with your payment so
						it’s matched to this invoice.
					</p>
				</section>
			)}

			<PublicInvoiceViewDetails invoice={invoice} />
		</>
	)
}
