import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { lazy, Suspense, useEffect, useState } from "react"
import { ThemeProvider } from "next-themes"
import { AppLoader } from "@/components/layout/app-loader"
import { ErrorBoundary } from "@/components/layout/error-boundary"
import { useNoNativeContextMenu } from "@/components/layout/app-context-menu"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MODE_CLASSES } from "@/lib/theme-classes"
import { MODE_IDS } from "@ledger/shared/themes"
import { queryClient } from "@/lib/queries"
import { SessionQueryCacheSync } from "@/lib/session-query-cache"
import { router } from "./router.ts"

const ConfirmHost = lazy(() =>
	import("@/components/common/confirm-dialog").then((module) => ({
		default: module.ConfirmHost,
	}))
)
const Toaster = lazy(() =>
	import("@/components/ui/sonner").then((module) => ({
		default: module.Toaster,
	}))
)

/**
 * Keeps the loader up while the router makes its first load. Until its route files arrive the router
 * renders nothing, which would leave a blank frame between the boot loader and the app's own.
 */
function BootLoader() {
	const [resolved, setResolved] = useState(false)
	useEffect(() => {
		const markResolved = () => {
			if (
				router.state.status === "idle" &&
				router.state.matches.length > 0
			) {
				setResolved(true)
			}
		}
		markResolved()
		return router.subscribe("onResolved", markResolved)
	}, [])
	return resolved ? null : <AppLoader />
}

/** Root layout: query cache, themes, router, confirm dialog, and toasts. */
export default function App() {
	useNoNativeContextMenu()
	return (
		<ErrorBoundary fullScreen>
			<QueryClientProvider client={queryClient}>
				<SessionQueryCacheSync />
				<ThemeProvider
					attribute="class"
					themes={MODE_IDS}
					value={MODE_CLASSES}
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<TooltipProvider delay={300}>
						<RouterProvider router={router} />
						<BootLoader />
					</TooltipProvider>
					<Suspense fallback={null}>
						<ConfirmHost />
						<Toaster />
					</Suspense>
				</ThemeProvider>
			</QueryClientProvider>
		</ErrorBoundary>
	)
}
