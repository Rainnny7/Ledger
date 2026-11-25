import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const DashboardPage = lazy(() =>
	import("@/pages/dashboard-page").then((module) => ({
		default: module.DashboardPage,
	}))
)

/** Dashboard: balances, budgets, and connection status. */
export const Route = createFileRoute("/_authed/_app/")({
	component: DashboardRoute,
})

function DashboardRoute() {
	return (
		<RoutePage>
			<DashboardPage />
		</RoutePage>
	)
}
