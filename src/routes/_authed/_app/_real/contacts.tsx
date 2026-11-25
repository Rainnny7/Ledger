import { createFileRoute } from "@tanstack/react-router"
import { lazy } from "react"
import { RoutePage } from "@/lib/router/route-page"

const ContactsPage = lazy(() =>
	import("@/pages/contacts-page").then((module) => ({
		default: module.ContactsPage,
	}))
)

/** Invoice client contacts (real accounts only). */
export const Route = createFileRoute("/_authed/_app/_real/contacts")({
	component: ContactsRoute,
})

function ContactsRoute() {
	return (
		<RoutePage>
			<ContactsPage />
		</RoutePage>
	)
}
