import {
	newItem,
	startDraft,
	type Draft,
} from "@/components/invoices/editor/draft"
import type { useInvoices, useWork } from "@/lib/queries"
import type { InvoiceEditorPageState } from "@/pages/use-invoice-editor-page"

type ResolveInvoiceEditorPageInput = {
	id: string | undefined
	fromBill: string | null
	copy: string | null
	data: ReturnType<typeof useInvoices>["data"]
	error: ReturnType<typeof useInvoices>["error"]
	reload: () => void
	work: ReturnType<typeof useWork>
}

/**
 * Maps invoice editor route and query results to a page state (no hooks).
 */
export function resolveInvoiceEditorPage(
	input: ResolveInvoiceEditorPageInput
): InvoiceEditorPageState {
	const { id, fromBill, copy, data, error, reload, work } = input
	const existing = id
		? data?.invoices.find((invoice) => invoice.id === id)
		: undefined

	if (error && !data) {
		return {
			kind: "query-error",
			message: error.message,
			retry: () => void reload(),
		}
	}
	if (work.error && !work.data && fromBill) {
		return {
			kind: "work-error",
			message: work.error.message,
			retry: () => void work.reload(),
		}
	}
	if (!data || (fromBill && !work.data)) {
		return { kind: "loading" }
	}
	if (id && !existing) {
		return { kind: "missing" }
	}

	const job = fromBill
		? work.data?.jobs.find((entry) =>
				entry.invoices.some((bill) => bill.id === fromBill)
			)
		: undefined
	const initial: Draft = existing
		? {
				...existing,
				items: existing.items.map((item) =>
					newItem(
						item.description,
						String(item.quantity),
						String(item.unitPrice)
					)
				),
			}
		: startDraft(data, {
				source: data.invoices.find((invoice) => invoice.id === copy),
				bill: job && fromBill ? { job, billId: fromBill } : undefined,
			})

	return {
		kind: "ready",
		editorKey: id ?? `new-${copy ?? ""}-${fromBill ?? ""}`,
		initial,
		existing: existing ?? null,
		data,
	}
}
