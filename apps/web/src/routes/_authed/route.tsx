import { createFileRoute } from "@tanstack/react-router"
import { RequireAuthLayout } from "@/lib/router/guards"

/** Requires a signed-in session before child routes render. */
export const Route = createFileRoute("/_authed")({
	component: RequireAuthLayout,
})
