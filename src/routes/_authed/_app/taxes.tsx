import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const TaxesPage = lazy(() =>
	import("@/pages/taxes-page").then((module) => ({
		default: module.TaxesPage,
	}))
)

/** Tax-tagged transaction report and CSV export. */
export const Route = createFileRoute("/_authed/_app/taxes")({
	component: TaxesRoute,
})

function TaxesRoute() {
	return (
		<RoutePage>
			<TaxesPage />
		</RoutePage>
	)
}
