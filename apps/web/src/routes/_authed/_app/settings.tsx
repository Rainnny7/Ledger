import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const SettingsPage = lazy(() =>
	import("@/pages/settings-page").then((module) => ({
		default: module.SettingsPage,
	}))
)

/** Profile, security, display, and connection settings. */
export const Route = createFileRoute("/_authed/_app/settings")({
	component: SettingsRoute,
})

function SettingsRoute() {
	return (
		<RoutePage>
			<SettingsPage />
		</RoutePage>
	)
}
