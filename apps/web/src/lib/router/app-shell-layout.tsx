import { Suspense, lazy } from "react"
import { AppLoader } from "@/components/layout/app-loader"

const AppShell = lazy(() =>
	import("@/components/layout/app-shell").then((module) => ({
		default: module.AppShell,
	}))
)

/** Authed pages share the nav header and main outlet. */
export function AppShellLayout() {
	return (
		<Suspense fallback={<AppLoader />}>
			<AppShell />
		</Suspense>
	)
}
