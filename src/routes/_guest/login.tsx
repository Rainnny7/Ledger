import { createFileRoute } from "@tanstack/react-router"
import { AuthPage } from "@/pages/auth-page"
import { RoutePage } from "@/lib/router/route-page"

/** Sign-in page. */
export const Route = createFileRoute("/_guest/login")({
	component: GuestLogin,
})

function GuestLogin() {
	return (
		<RoutePage>
			<AuthPage mode="login" />
		</RoutePage>
	)
}
