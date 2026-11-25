import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const InvoiceEditorPage = lazy(() =>
	import("@/pages/invoice-editor-page").then((module) => ({
		default: module.InvoiceEditorPage,
	}))
)

/** Create a new invoice. */
export const Route = createFileRoute("/_authed/_app/invoices/new")({
	component: NewInvoiceRoute,
})

function NewInvoiceRoute() {
	return (
		<RoutePage>
			<InvoiceEditorPage />
		</RoutePage>
	)
}
