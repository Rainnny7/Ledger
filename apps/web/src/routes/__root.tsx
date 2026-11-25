import { createRootRoute, Outlet } from "@tanstack/react-router"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { ErrorBoundary } from "@/components/layout/error-boundary"

/** Root layout, providers, and router outlet. */
export const Route = createRootRoute({
	component: RootLayout,
	errorComponent: RootError,
})

function RootLayout() {
	return (
		<NuqsAdapter>
			<Outlet />
		</NuqsAdapter>
	)
}

function RootError() {
	return <ErrorBoundary fullScreen>{null}</ErrorBoundary>
}
