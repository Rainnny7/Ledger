import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const SubscriptionsPage = lazy(() =>
	import("@/pages/subscriptions-page").then((module) => ({
		default: module.SubscriptionsPage,
	}))
)

/** Recurring subscriptions and renewals. */
export const Route = createFileRoute("/_authed/_app/subscriptions")({
	component: SubscriptionsRoute,
})

function SubscriptionsRoute() {
	return (
		<RoutePage>
			<SubscriptionsPage />
		</RoutePage>
	)
}
