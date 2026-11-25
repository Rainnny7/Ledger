import { createFileRoute, Navigate } from "@tanstack/react-router"

/** Catch-all for unknown paths (not found). */
export const Route = createFileRoute("/$")({
	component: UnknownRouteRedirect,
})

function UnknownRouteRedirect() {
	return <Navigate to="/" replace />
}
