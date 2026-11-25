import { CheckCircle2, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PublicInvoice } from "@/lib/api"
import { daysFromToday, formatDate } from "@/lib/format"
import { formatQty, formatRate, invoiceMoney } from "@/lib/invoice"
import { lineAmount } from "@ledger/shared/invoice"
import { cn } from "cn"
import { pdfFileName } from "@/components/invoices/pdf-files"
import { usePdfDownload } from "@/components/invoices/use-pdf-download"
import { PublicMethodCard } from "@/components/invoices/public/method-card"
import {
	Party,
	TextBlock,
	Total,
} from "@/components/invoices/public/layout-bits"

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
	const money = (amount: number) => invoiceMoney(amount, invoice.currency)
	const discount = Math.min(invoice.discount, invoice.subtotal)
	const paid = invoice.payState === "paid"
	const isVoid = invoice.status === "void"
	const overdue =
		!paid &&
		!isVoid &&
		invoice.dueDate &&
		daysFromToday(invoice.dueDate) < 0
	const methods = invoice.methods

	return (
		<>
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
							<Download />
						)}
						Download PDF
					</Button>
				</div>

				<div className="grid gap-1">
					<p className="text-sm text-muted-foreground">
						{paid
							? "Paid in full"
							: isVoid
								? "Cancelled"
								: invoice.paid > 0
									? "Balance due"
									: "Amount due"}
					</p>
					<p
						className={cn(
							"text-4xl font-semibold tracking-tight tabular-nums",
							(paid || isVoid) && "text-muted-foreground"
						)}
					>
						{money(paid ? invoice.total : invoice.balance)}
					</p>
					<p
						className={cn(
							"text-sm",
							overdue
								? "font-medium text-red-600 dark:text-red-400"
								: "text-muted-foreground"
						)}
					>
						{paid ? (
							<span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
								<CheckCircle2 className="size-4" /> Thank you,
								this invoice is paid.
							</span>
						) : isVoid ? (
							"This invoice was cancelled. Nothing is owed."
						) : invoice.dueDate ? (
							`${overdue ? "Was due" : "Due"} ${formatDate(invoice.dueDate)}`
						) : (
							"Due on receipt"
						)}
					</p>
				</div>

				{capturing && (
					<p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
						<Loader2 className="size-4 animate-spin" /> Finishing
						your PayPal payment…
					</p>
				)}
			</section>

			{!paid && !isVoid && methods.length > 0 && (
				<section className="grid gap-3">
					<h2 className="text-sm font-semibold">How to pay</h2>
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

			<section className="grid gap-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
				<div className="grid gap-6 sm:grid-cols-3">
					<Party label="From" party={invoice.from} />
					<Party label="Bill to" party={invoice.client} />
					<div className="grid content-start gap-1 text-sm">
						<span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Details
						</span>
						<span>Issued {formatDate(invoice.issueDate)}</span>
						<span>
							{invoice.dueDate
								? `Due ${formatDate(invoice.dueDate)}`
								: "Due on receipt"}
						</span>
					</div>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-left text-xs text-muted-foreground">
								<th className="py-2 pr-3 font-medium">
									Description
								</th>
								<th className="py-2 pr-3 text-right font-medium">
									Qty
								</th>
								<th className="py-2 pr-3 text-right font-medium">
									Rate
								</th>
								<th className="py-2 text-right font-medium">
									Amount
								</th>
							</tr>
						</thead>
						<tbody>
							{invoice.items.map((i, index) => (
								<tr
									key={index}
									className="border-b last:border-0"
								>
									<td className="py-2.5 pr-3">
										{i.description}
									</td>
									<td className="py-2.5 pr-3 text-right tabular-nums">
										{formatQty(i.quantity)}
									</td>
									<td className="py-2.5 pr-3 text-right tabular-nums">
										{money(i.unitPrice)}
									</td>
									<td className="py-2.5 text-right tabular-nums">
										{money(lineAmount(i))}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="ml-auto grid w-full max-w-xs gap-1.5 text-sm">
					<Total label="Subtotal" value={money(invoice.subtotal)} />
					{discount > 0 && (
						<Total label="Discount" value={money(-discount)} />
					)}
					{invoice.taxRate > 0 && (
						<Total
							label={`${invoice.taxLabel} (${formatRate(invoice.taxRate)})`}
							value={money(invoice.tax)}
						/>
					)}
					<Total
						label="Total"
						value={money(invoice.total)}
						strong={invoice.paid === 0}
					/>
					{invoice.paid !== 0 && (
						<>
							<Total label="Paid" value={money(-invoice.paid)} />
							<Total
								label="Balance due"
								value={money(invoice.balance)}
								strong
							/>
						</>
					)}
				</div>

				{(invoice.notes || invoice.terms) && (
					<div className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
						{invoice.notes && (
							<TextBlock label="Notes" text={invoice.notes} />
						)}
						{invoice.terms && (
							<TextBlock label="Terms" text={invoice.terms} />
						)}
					</div>
				)}
			</section>
		</>
	)
}
