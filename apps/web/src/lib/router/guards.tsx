import { Navigate, Outlet } from "@tanstack/react-router"
import { Suspense, useEffect, lazy } from "react"
import { AppLoader } from "@/components/layout/app-loader"
import { useSession } from "@/lib/auth-client"
import { demoMode } from "@/lib/demo"

const ChangeTemporaryPasswordPage = lazy(() =>
	import("@/pages/temporary-password-page").then((module) => ({
		default: module.ChangeTemporaryPasswordPage,
	}))
)

/**
 * Set while this browser has a session, so a reload can put the app's header up straight away
 * instead of waiting on the session check. If the session turns out to be gone, it's off to log in.
 */
const SIGNED_IN_KEY = "ledger.logged-in"

function rememberSignedIn(signedIn: boolean) {
	try {
		if (signedIn) {
			localStorage.setItem(SIGNED_IN_KEY, "1")
		} else {
			localStorage.removeItem(SIGNED_IN_KEY)
		}
	} catch {
		// Storage blocked: the first load just waits on the session check.
	}
}

function probablySignedIn() {
	try {
		return localStorage.getItem(SIGNED_IN_KEY) === "1"
	} catch {
		return false
	}
}

/** Sends signed-out visitors to login; logged-in users continue (or pick a new password first). */
export function RequireAuthLayout() {
	const { data, isPending } = useSession()
	useEffect(() => {
		if (!isPending) {
			rememberSignedIn(Boolean(data))
		}
	}, [data, isPending])
	if (isPending) {
		return probablySignedIn() ? <Outlet /> : <AppLoader />
	}
	if (!data) {
		return <Navigate to="/login" replace />
	}
	if (data.user.mustChangePassword) {
		return (
			<Suspense fallback={<AppLoader />}>
				<ChangeTemporaryPasswordPage />
			</Suspense>
		)
	}
	return <Outlet />
}

/** Real-account pages: admins only, and hidden while showing demo data. */
export function RequireAdminLayout() {
	const { data, isPending } = useSession()
	if (isPending) {
		return <AppLoader inPage />
	}
	if (data?.user.role === "admin" && !demoMode) {
		return <Outlet />
	}
	return <Navigate to="/" replace />
}

/** Contacts are real people, so they're off-limits in demo mode. */
export function NotInDemoLayout() {
	if (demoMode) {
		return <Navigate to="/" replace />
	}
	return <Outlet />
}

/** Login and register are only for people who aren't already logged in. */
export function GuestOnlyLayout() {
	const { data, isPending } = useSession()
	if (isPending) {
		return <AppLoader />
	}
	if (data) {
		return <Navigate to="/" replace />
	}
	return <Outlet />
}
