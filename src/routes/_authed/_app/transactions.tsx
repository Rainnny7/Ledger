import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const TransactionsPage = lazy(() =>
	import("@/pages/transactions-page").then((module) => ({
		default: module.TransactionsPage,
	}))
)

/** Searchable transaction list across accounts. */
export const Route = createFileRoute("/_authed/_app/transactions")({
	component: TransactionsRoute,
})

function TransactionsRoute() {
	return (
		<RoutePage>
			<TransactionsPage />
		</RoutePage>
	)
}
