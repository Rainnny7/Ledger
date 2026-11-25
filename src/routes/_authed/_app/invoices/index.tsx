import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const InvoicesPage = lazy(() =>
	import("@/pages/invoices-page").then((module) => ({
		default: module.InvoicesPage,
	}))
)

/** Invoice list and payment status. */
export const Route = createFileRoute("/_authed/_app/invoices/")({
	component: InvoicesRoute,
})

function InvoicesRoute() {
	return (
		<RoutePage>
			<InvoicesPage />
		</RoutePage>
	)
}
