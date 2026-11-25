import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { ThemeProvider } from "next-themes"
import { ErrorBoundary } from "@/components/layout/error-boundary"
import { useNoNativeContextMenu } from "@/components/layout/app-context-menu"
import { TooltipProvider } from "@/components/ui/tooltip"
import { THEME_CLASSES } from "@/lib/theme-classes"
import { THEME_IDS } from "@ledger/shared/themes"
import { queryClient } from "@/lib/queries"
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

/** Root layout: query cache, themes, router, confirm dialog, and toasts. */
export default function App() {
	useNoNativeContextMenu()
	return (
		<ErrorBoundary fullScreen>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider
					attribute="class"
					themes={THEME_IDS}
					value={THEME_CLASSES}
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<TooltipProvider delay={300}>
						<RouterProvider router={router} />
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
