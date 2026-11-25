import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const AdvisorPage = lazy(() =>
	import("@/pages/advisor-page").then((module) => ({
		default: module.AdvisorPage,
	}))
)

/** Personalized spending and savings tips. */
export const Route = createFileRoute("/_authed/_app/advisor")({
	component: AdvisorRoute,
})

function AdvisorRoute() {
	return (
		<RoutePage>
			<AdvisorPage />
		</RoutePage>
	)
}
