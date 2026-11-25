import { useLocation } from "@tanstack/react-router"
import { type ReactNode, Suspense, useEffect } from "react"
import { AppLoader } from "@/components/layout/app-loader"
import { ErrorBoundary } from "@/components/layout/error-boundary"

/** Wraps a page in error handling and the same deferred loader used across the app. */
export function RoutePage({ children }: { children: ReactNode }) {
	const location = useLocation()
	return (
		<ErrorBoundary resetKey={location.pathname}>
			<Suspense fallback={<AppLoader inPage delayed={pageShown} />}>
				<PageShown />
				{children}
			</Suspense>
		</ErrorBoundary>
	)
}

let pageShown = false

function PageShown() {
	useEffect(() => {
		pageShown = true
	}, [])
	return null
}
