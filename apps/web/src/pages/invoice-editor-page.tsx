import { Link } from "@tanstack/react-router"
import { EditorSkeleton } from "@/components/invoices/editor/editor-skeleton"
import { InvoiceEditor } from "@/components/invoices/editor/invoice-editor"
import { QueryError } from "@/components/ui/query-error"
import { useInvoiceEditorPage } from "@/pages/use-invoice-editor-page"

/** Create or edit an invoice: line items, theme, PDF preview, and payment methods. */
export function InvoiceEditorPage() {
	const state = useInvoiceEditorPage()

	if (state.kind === "query-error") {
		return <QueryError message={state.message} onRetry={state.retry} />
	}
	if (state.kind === "work-error") {
		return <QueryError message={state.message} onRetry={state.retry} />
	}
	if (state.kind === "loading") {
		return <EditorSkeleton />
	}
	if (state.kind === "missing") {
		return (
			<p className="text-sm text-muted-foreground">
				That invoice doesn’t exist any more.{" "}
				<Link to="/invoices" className="underline">
					Back to invoices
				</Link>
			</p>
		)
	}

	return (
		<InvoiceEditor
			key={state.editorKey}
			data={state.data}
			saved={state.existing}
			initial={state.initial}
		/>
	)
}
