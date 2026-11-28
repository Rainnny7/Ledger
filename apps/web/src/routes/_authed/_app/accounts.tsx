import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const AccountsPage = lazy(() =>
	import("@/pages/accounts-page").then((module) => ({
		default: module.AccountsPage,
	}))
)

/**
 * Accounts layout: the rail and the transactions pane for `/accounts` and `/accounts/$id`. It
 * renders no outlet; the child routes only say which account is selected, so switching accounts
 * keeps the page mounted.
 */
export const Route = createFileRoute("/_authed/_app/accounts")({
	component: AccountsRoute,
})

function AccountsRoute() {
	return (
		<RoutePage>
			<AccountsPage />
		</RoutePage>
	)
}
