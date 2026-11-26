import { createFileRoute } from "@tanstack/react-router"
import { AuthPage } from "@/pages/auth-page"
import { RoutePage } from "@/lib/router/route-page"

/** The single log in / sign up page. */
export const Route = createFileRoute("/_guest/login")({
	component: GuestLogin,
})

function GuestLogin() {
	return (
		<RoutePage>
			<AuthPage />
		</RoutePage>
	)
}
