import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const InvoiceEditorPage = lazy(() =>
	import("@/pages/invoice-editor-page").then((module) => ({
		default: module.InvoiceEditorPage,
	}))
)

/** Edit an existing invoice draft or sent copy. */
export const Route = createFileRoute("/_authed/_app/invoices/$id")({
	component: EditInvoiceRoute,
})

function EditInvoiceRoute() {
	return (
		<RoutePage>
			<InvoiceEditorPage />
		</RoutePage>
	)
}
