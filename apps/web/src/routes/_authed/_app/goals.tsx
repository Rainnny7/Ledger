import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const GoalsPage = lazy(() =>
	import("@/pages/goals-page").then((module) => ({
		default: module.GoalsPage,
	}))
)

/** Savings and debt payoff goals. */
export const Route = createFileRoute("/_authed/_app/goals")({
	component: GoalsRoute,
})

function GoalsRoute() {
	return (
		<RoutePage>
			<GoalsPage />
		</RoutePage>
	)
}
