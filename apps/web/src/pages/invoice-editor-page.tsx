import { Link, useParams } from "@tanstack/react-router"
import { useQueryState } from "nuqs"
import { EditorSkeleton } from "@/components/invoices/editor/editor-skeleton"
import { InvoiceEditor } from "@/components/invoices/editor/invoice-editor"
import {
	newItem,
	startDraft,
	type Draft,
} from "@/components/invoices/editor/draft"
import { useInvoices, useWork } from "@/lib/queries"

/** Create or edit an invoice: line items, theme, PDF preview, and payment methods. */
export function InvoiceEditorPage() {
	const { id } = useParams({ strict: false })
	const [fromBill] = useQueryState("fromBill")
	const [copy] = useQueryState("copy")
	const { data, error } = useInvoices()
	const work = useWork()
	const existing = id
		? data?.invoices.find((invoice) => invoice.id === id)
		: undefined

	if (error) {
		return <p className="text-sm text-destructive">{error.message}</p>
	}
	if (!data || (fromBill && !work.data)) {
		return <EditorSkeleton />
	}
	if (id && !existing) {
		return (
			<p className="text-sm text-muted-foreground">
				That invoice doesn’t exist any more.{" "}
				<Link to="/invoices" className="underline">
					Back to invoices
				</Link>
			</p>
		)
	}

	const job = fromBill
		? work.data?.jobs.find((entry) =>
				entry.invoices.some((bill) => bill.id === fromBill)
			)
		: undefined
	const initial: Draft = existing
		? {
				...existing,
				items: existing.items.map((i) =>
					newItem(
						i.description,
						String(i.quantity),
						String(i.unitPrice)
					)
				),
			}
		: startDraft(data, {
				source: data.invoices.find((i) => i.id === copy),
				bill: job && fromBill ? { job, billId: fromBill } : undefined,
			})

	return (
		<InvoiceEditor
			key={id ?? `new-${copy ?? ""}-${fromBill ?? ""}`}
			data={data}
			saved={existing ?? null}
			initial={initial}
		/>
	)
}
