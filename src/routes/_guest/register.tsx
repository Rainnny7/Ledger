import { createFileRoute } from "@tanstack/react-router"
import { AuthPage } from "@/pages/auth-page"
import { RoutePage } from "@/lib/router/route-page"

/** Account registration page. */
export const Route = createFileRoute("/_guest/register")({
	component: GuestRegister,
})

function GuestRegister() {
	return (
		<RoutePage>
			<AuthPage mode="register" />
		</RoutePage>
	)
}
