import { Loader2 } from "lucide-react"
import { DownloadIcon } from "@/components/icons/download"
import { Button } from "@/components/ui/button"
import type { PublicInvoice } from "@/lib/api"
import { pdfFileName } from "@/components/invoices/pdf-files"
import { PublicInvoiceViewAmount } from "@/components/invoices/public/public-invoice-view-amount"
import type { usePdfDownload } from "@/components/invoices/use-pdf-download"

/** Hero summary: amount due, status, and PDF download on the public invoice page. */
export function PublicInvoiceViewSummary({
	invoice,
	methods,
	capturing,
	downloadPdf,
}: {
	invoice: PublicInvoice
	methods: PublicInvoice["methods"]
	capturing: boolean
	downloadPdf: ReturnType<typeof usePdfDownload>
}) {
	return (
		<section className="grid gap-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<p className="text-sm text-muted-foreground">
						Invoice {invoice.number}
					</p>
					<h1 className="truncate text-xl font-semibold tracking-tight">
						{invoice.from.name || "Invoice"}
					</h1>
				</div>
				<Button
					variant="outline"
					onClick={() =>
						downloadPdf.mutate({
							source: {
								invoice,
								methods,
								paid: invoice.paid,
								url:
									window.location.origin +
									window.location.pathname,
							},
							name: pdfFileName(invoice),
						})
					}
					disabled={downloadPdf.isPending}
				>
					{downloadPdf.isPending ? (
						<Loader2 className="animate-spin" />
					) : (
						<DownloadIcon size={24} className="flex" />
					)}
					Download PDF
				</Button>
			</div>

			<PublicInvoiceViewAmount invoice={invoice} />

			{capturing && (
				<p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
					<Loader2 className="size-4 animate-spin" /> Finishing your
					PayPal payment…
				</p>
			)}
		</section>
	)
}
