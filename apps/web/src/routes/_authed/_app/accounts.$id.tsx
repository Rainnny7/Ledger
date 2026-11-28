import { createFileRoute } from "@tanstack/react-router"

/** One account selected; the page itself renders from the `/accounts` layout. */
export const Route = createFileRoute("/_authed/_app/accounts/$id")({})
