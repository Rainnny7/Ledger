import { createFileRoute } from "@tanstack/react-router"
import { RequireAdminLayout } from "@/lib/router/guards"

/** Admin-only routes; redirects non-owners. */
export const Route = createFileRoute("/_authed/_app/_admin")({
	component: RequireAdminLayout,
})
