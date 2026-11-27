import { useMemo } from "react"
import { useParams } from "@tanstack/react-router"
import { useQueryState } from "nuqs"
import type { Draft } from "@/components/invoices/editor/draft"
import { useInvoices, useWork } from "@/lib/queries"
import { resolveInvoiceEditorPage } from "@/pages/resolve-invoice-editor-page"

export type InvoiceEditorPageState =
	| { kind: "query-error"; message: string; retry: () => void }
	| { kind: "work-error"; message: string; retry: () => void }
	| { kind: "loading" }
	| { kind: "missing" }
	| {
			kind: "ready"
			editorKey: string
			initial: Draft
			existing:
				| NonNullable<
						ReturnType<typeof useInvoices>["data"]
				  >["invoices"][number]
				| null
			data: NonNullable<ReturnType<typeof useInvoices>["data"]>
	  }

/**
 * Resolves invoice editor route params, queries, and draft bootstrap state.
 */
export function useInvoiceEditorPage(): InvoiceEditorPageState {
	const { id } = useParams({ strict: false })
	const [fromBill] = useQueryState("fromBill")
	const [copy] = useQueryState("copy")
	const { data, error, reload } = useInvoices()
	const work = useWork()

	return useMemo(
		() =>
			resolveInvoiceEditorPage({
				id,
				fromBill,
				copy,
				data,
				error,
				reload,
				work,
			}),
		[id, fromBill, copy, data, error, reload, work]
	)
}
