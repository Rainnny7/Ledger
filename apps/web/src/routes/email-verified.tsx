import { createFileRoute } from "@tanstack/react-router"
import { EmailVerifiedPage } from "@/pages/email-verified-page"
import { RoutePage } from "@/lib/router/route-page"

/** Public callback after the user confirms their email (signed in or out). */
export const Route = createFileRoute("/email-verified")({
	validateSearch: (search: Record<string, unknown>) => ({
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: EmailVerifiedRoute,
})

function EmailVerifiedRoute() {
	return (
		<RoutePage>
			<EmailVerifiedPage />
		</RoutePage>
	)
}
