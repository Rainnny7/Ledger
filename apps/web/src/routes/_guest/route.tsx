import { createFileRoute } from "@tanstack/react-router"
import { GuestOnlyLayout } from "@/lib/router/guards"

/** Layout for login and registration (no app chrome). */
export const Route = createFileRoute("/_guest")({
	component: GuestOnlyLayout,
})
