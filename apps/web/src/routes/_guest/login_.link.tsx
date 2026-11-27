import { createFileRoute } from "@tanstack/react-router"
import { LoginLinkPage } from "@/pages/login-link-page"
import { RoutePage } from "@/lib/router/route-page"

/** Mail-scanner-safe step before the magic-link verify endpoint. */
export const Route = createFileRoute("/_guest/login_/link")({
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : "",
	}),
	component: GuestLoginLink,
})

function GuestLoginLink() {
	return (
		<RoutePage>
			<LoginLinkPage />
		</RoutePage>
	)
}
