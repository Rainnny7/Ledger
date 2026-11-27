/**
 * Keeps one user's cached server data from being shown to the next one. Query keys carry no user id,
 * so the whole cache (and per-user browser state) is dropped whenever the signed-in identity ends or
 * changes: sign-out, session expiry or revocation, or a different account signing in in the same tab.
 */
import { useEffect } from "react"
import { authClient } from "@/lib/auth-client"
import { clearPaletteRecents } from "@/components/layout/command-palette-data"
import { queryClient } from "@/lib/queries"

/** Session atom shape from Better Auth's React client store. */
type SessionStoreValue = {
	data?: { user?: { id: string } } | null
	isPending?: boolean
}

/** The last settled signed-in user id; null when signed out, undefined before the first settled read. */
let previousUserId: string | null | undefined
let syncStarted = false

/**
 * Records the settled identity and clears client state when a signed-in user is replaced by
 * nobody or by someone else. Signing in from a signed-out state clears nothing: the cache was
 * already dropped when the previous user left, and clearing then would cancel the new user's
 * first queries.
 */
function resetClientStateForNewIdentity(nextUserId: string | null) {
	const leavingUserId = previousUserId
	previousUserId = nextUserId
	if (!leavingUserId || leavingUserId === nextUserId) {
		return
	}
	queryClient.clear()
	clearPaletteRecents()
}

function applySessionAtomIdentity() {
	const value =
		authClient.$store.atoms.session.get() as SessionStoreValue | null
	// A loading session says nothing about who is signed in yet.
	if (value?.isPending) {
		return
	}
	resetClientStateForNewIdentity(value?.data?.user?.id ?? null)
}

/** Subscribes to Better Auth session identity and clears cached server data on sign-out or account switch. */
export function startSessionQueryCacheSync() {
	if (syncStarted || typeof window === "undefined") {
		return
	}
	syncStarted = true
	applySessionAtomIdentity()
	authClient.$store.atoms.session.subscribe(() => {
		applySessionAtomIdentity()
	})
	// A 401 notifies $sessionSignal before the atom has caught up, so ask the server who is signed in.
	authClient.$store.listen("$sessionSignal", () => {
		void authClient.getSession().then(({ data }) => {
			resetClientStateForNewIdentity(data?.user?.id ?? null)
		})
	})
}

/** Mount once under QueryClientProvider so session transitions wipe the previous user's cache first. */
export function SessionQueryCacheSync() {
	useEffect(() => {
		startSessionQueryCacheSync()
	}, [])
	return null
}
