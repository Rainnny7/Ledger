import type { PublicInvoice } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { formatQty, formatRate, invoiceMoney } from "@/lib/invoice"
import { lineAmount } from "@ledger/shared/invoice"
import {
	Party,
	TextBlock,
	Total,
} from "@/components/invoices/public/layout-bits"

/** Line items, totals, and notes on the public invoice page. */
export function PublicInvoiceViewDetails({
	invoice,
}: {
	invoice: PublicInvoice
}) {
	const money = (amount: number) => invoiceMoney(amount, invoice.currency)
	const discount = Math.min(invoice.discount, invoice.subtotal)

	return (
		<section className="grid gap-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
			<div className="grid gap-6 sm:grid-cols-3">
				<Party label="From" party={invoice.from} />
				<Party label="Bill To" party={invoice.client} />
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
						{invoice.items.map((item, itemIndex) => (
							<tr
								key={`${itemIndex}-${item.description}-${item.quantity}-${item.unitPrice}`}
								className="border-b last:border-0"
							>
								<td className="py-2.5 pr-3">
									{item.description}
								</td>
								<td className="py-2.5 pr-3 text-right tabular-nums">
									{formatQty(item.quantity)}
								</td>
								<td className="py-2.5 pr-3 text-right tabular-nums">
									{money(item.unitPrice)}
								</td>
								<td className="py-2.5 text-right tabular-nums">
									{money(lineAmount(item))}
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
							label="Balance Due"
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
	)
}
