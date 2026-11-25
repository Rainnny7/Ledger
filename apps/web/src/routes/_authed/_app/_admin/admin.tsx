import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const AdminPage = lazy(() =>
	import("@/pages/admin-page").then((module) => ({
		default: module.AdminPage,
	}))
)

/** Owner admin console: users, backups, tasks. */
export const Route = createFileRoute("/_authed/_app/_admin/admin")({
	component: AdminRoute,
})

function AdminRoute() {
	return (
		<RoutePage>
			<AdminPage />
		</RoutePage>
	)
}
