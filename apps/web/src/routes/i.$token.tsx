import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const PublicInvoicePage = lazy(() =>
	import("@/pages/public-invoice-page").then((module) => ({
		default: module.PublicInvoicePage,
	}))
)

/** The share link you send people: no login. */
export const Route = createFileRoute("/i/$token")({
	component: PublicInvoiceRoute,
})

function PublicInvoiceRoute() {
	return (
		<RoutePage>
			<PublicInvoicePage />
		</RoutePage>
	)
}
