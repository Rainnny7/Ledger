import { createFileRoute } from "@tanstack/react-router"

/** "All accounts" selected; the page itself renders from the `/accounts` layout. */
export const Route = createFileRoute("/_authed/_app/accounts/")({})
