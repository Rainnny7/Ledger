import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const WorkPage = lazy(() =>
	import("@/pages/work-page").then((module) => ({
		default: module.WorkPage,
	}))
)

/** Freelance jobs, hours, and client invoices. */
export const Route = createFileRoute("/_authed/_app/work")({
	component: WorkRoute,
})

function WorkRoute() {
	return (
		<RoutePage>
			<WorkPage />
		</RoutePage>
	)
}
