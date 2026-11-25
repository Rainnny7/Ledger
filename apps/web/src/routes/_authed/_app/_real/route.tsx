import { createFileRoute } from "@tanstack/react-router"
import { NotInDemoLayout } from "@/lib/router/guards"

/** Routes that need a real (non-demo) bank connection. */
export const Route = createFileRoute("/_authed/_app/_real")({
	component: NotInDemoLayout,
})
