import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const InsightsPage = lazy(() =>
	import("@/pages/insights-page").then((module) => ({
		default: module.InsightsPage,
	}))
)

/** Spending breakdowns and merchant trends. */
export const Route = createFileRoute("/_authed/_app/insights")({
	component: InsightsRoute,
})

function InsightsRoute() {
	return (
		<RoutePage>
			<InsightsPage />
		</RoutePage>
	)
}
