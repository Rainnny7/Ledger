import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const AccountPage = lazy(() =>
	import("@/pages/account-page").then((module) => ({
		default: module.AccountPage,
	}))
)

/** Single account: transactions, limits, statements. */
export const Route = createFileRoute("/_authed/_app/accounts/$id")({
	component: AccountRoute,
})

function AccountRoute() {
	return (
		<RoutePage>
			<AccountPage />
		</RoutePage>
	)
}
