import { Elysia } from "elysia"
import { auth } from "../auth/index.ts"
import { apiErrors } from "../http/errors.ts"
import { personaOf, userIdOf } from "../demo/personas.ts"
import { ensureDemoData } from "../demo/seed.ts"

/** The logged-in user as Better Auth reports them. */
export type SessionUser = typeof auth.$Infer.Session.user

/** Logged in on a temporary password: only the change-password screen works until it's replaced. */
const mustChangePassword = (user: object) =>
	(user as { mustChangePassword?: boolean }).mustChangePassword === true
const PASSWORD_CHANGE_REQUIRED = {
	error: "Choose a new password to continue.",
	code: "PASSWORD_CHANGE_REQUIRED",
}

/** POST routes that only read data, so demo mode (read-only) may call them. */
const DEMO_SAFE_POST_PATHS = new Set([
	"/api/banks/chat",
	"/api/banks/chat/suggestions",
])

/**
 * Logged-in access to `/api/banks/*`: answers 401 without a session, 403 while a temporary
 * password is still in place, and otherwise provides `user` to every handler. Responses are never
 * cached. Demo mode (the X-Ledger-Demo header) swaps in the made-up demo user's id, read-only.
 */
export const sessionUser = new Elysia({ name: "session-user" })
	.use(apiErrors)
	.derive({ as: "scoped" }, async ({ request, set, status }) => {
		const session = await auth.api.getSession({ headers: request.headers })
		if (!session) {
			return status(401, { error: "Unauthorized" }) as never
		}
		if (mustChangePassword(session.user)) {
			return status(403, PASSWORD_CHANGE_REQUIRED) as never
		}
		set.headers["cache-control"] = "no-store"
		// Demo mode: show the made-up demo user's data instead of the caller's, read-only.
		const demo = request.headers.get("x-ledger-demo")
		if (!demo) {
			return { user: session.user }
		}
		const isDemoSafe =
			request.method === "GET" ||
			(request.method === "POST" &&
				DEMO_SAFE_POST_PATHS.has(new URL(request.url).pathname))
		if (!isDemoSafe) {
			return status(403, {
				error: "Demo mode is read-only. Exit demo mode to make changes.",
			}) as never
		}
		// "1" is the original switch; anything else names a persona (unknown ones fall back to the default).
		const persona = personaOf(demo)
		ensureDemoData(persona.id)
		return { user: { ...session.user, id: userIdOf(persona) } }
	})

/**
 * Admin-only access to `/api/admin/*`: 401 without a session, 403 for non-admins and while a
 * temporary password is still in place; otherwise provides `user`. Responses are never cached.
 */
export const adminUser = new Elysia({ name: "admin-user" })
	.use(apiErrors)
	.derive({ as: "scoped" }, async ({ request, set, status }) => {
		const session = await auth.api.getSession({ headers: request.headers })
		if (!session) {
			return status(401, { error: "Unauthorized" }) as never
		}
		if (session.user.role !== "admin") {
			return status(403, { error: "Admins only" }) as never
		}
		if (mustChangePassword(session.user)) {
			return status(403, PASSWORD_CHANGE_REQUIRED) as never
		}
		set.headers["cache-control"] = "no-store"
		return { user: session.user }
	})
