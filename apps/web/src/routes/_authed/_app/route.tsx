import { createFileRoute } from "@tanstack/react-router"
import { AppShellLayout } from "@/lib/router/app-shell-layout"

/** Main app shell (nav, demo banner, outlet). */
export const Route = createFileRoute("/_authed/_app")({
	component: AppShellLayout,
})
