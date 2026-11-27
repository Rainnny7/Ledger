import { APIError, isAPIError } from "better-auth/api"
import { audit, emailOf, getOwnerId } from "../admin/store.ts"

const SIGN_IN_FAIL_WINDOW_MS = 15 * 60 * 1000
const SIGN_IN_FAIL_MAX = 10
const BACKOFF_CAP = 5000
const signInFailures = new Map<string, number[]>()

/** Seconds between resending login-link or verification emails to the same address. */
export const EMAIL_RESEND_COOLDOWN_SECONDS = 60
/** Same interval in milliseconds for in-memory cooldown tracking. */
export const EMAIL_RESEND_COOLDOWN_MS = EMAIL_RESEND_COOLDOWN_SECONDS * 1000
const EMAIL_RESEND_TRACKED_CAP = 5000
const emailResendLastSent = new Map<string, number>()

function emailResendKey(kind: string, email: string) {
	return `${kind}:${email.trim().toLowerCase()}`
}

/** Shape check only — not deliverability; keeps failed login audits from junk input. */
export function isPlausibleEmail(email: string): boolean {
	const normalizedEmail = email.trim()
	return (
		normalizedEmail.length > 0 &&
		normalizedEmail.length <= 254 &&
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) &&
		!/[\r\n\0]/.test(normalizedEmail)
	)
}

function trimBackoffMap() {
	if (signInFailures.size <= BACKOFF_CAP) {
		return
	}
	const now = Date.now()
	for (const [key, times] of signInFailures) {
		const live = times.filter(
			(failureTime) => now - failureTime < SIGN_IN_FAIL_WINDOW_MS
		)
		if (live.length === 0) {
			signInFailures.delete(key)
		} else {
			signInFailures.set(key, live)
		}
		if (signInFailures.size <= BACKOFF_CAP) {
			break
		}
	}
}

function trimEmailResendMap() {
	if (emailResendLastSent.size <= EMAIL_RESEND_TRACKED_CAP) {
		return
	}
	const now = Date.now()
	for (const [key, sentAt] of emailResendLastSent) {
		if (now - sentAt >= EMAIL_RESEND_COOLDOWN_MS) {
			emailResendLastSent.delete(key)
		}
		if (emailResendLastSent.size <= EMAIL_RESEND_TRACKED_CAP) {
			break
		}
	}
}

/** True when this address already received this kind of email inside the cooldown window. */
export function emailResendCooldownBlocked(
	kind: string,
	email: string
): boolean {
	const key = emailResendKey(kind, email)
	const sentAt = emailResendLastSent.get(key)
	if (!sentAt) {
		return false
	}
	if (Date.now() - sentAt < EMAIL_RESEND_COOLDOWN_MS) {
		return true
	}
	emailResendLastSent.delete(key)
	return false
}

/** Whole seconds left before the same address can receive this kind of email again. */
export function emailResendCooldownRemainingSeconds(
	kind: string,
	email: string
): number {
	const key = emailResendKey(kind, email)
	const sentAt = emailResendLastSent.get(key)
	if (!sentAt) {
		return 0
	}
	const elapsed = Date.now() - sentAt
	if (elapsed >= EMAIL_RESEND_COOLDOWN_MS) {
		return 0
	}
	return Math.ceil((EMAIL_RESEND_COOLDOWN_MS - elapsed) / 1000)
}

/** Marks that this kind of email was just queued for this address. */
export function recordEmailResendSent(kind: string, email: string) {
	const key = emailResendKey(kind, email)
	emailResendLastSent.set(key, Date.now())
	trimEmailResendMap()
}

/** Recent login window for sensitive account changes (milliseconds). */
export const RECENT_LOGIN_MAX_MS = 10 * 60 * 1000

/** Per-email login backoff (in memory, bounded). */
export function signInBackoffBlocked(email: string): boolean {
	const key = email.trim().toLowerCase()
	const now = Date.now()
	const recent = (signInFailures.get(key) ?? []).filter(
		(failureTime) => now - failureTime < SIGN_IN_FAIL_WINDOW_MS
	)
	signInFailures.set(key, recent)
	trimBackoffMap()
	return recent.length >= SIGN_IN_FAIL_MAX
}

/** Track failed logins for rate limiting by email. */
export function recordSignInFailure(email: string) {
	if (!isPlausibleEmail(email)) {
		return
	}
	const key = email.trim().toLowerCase()
	const now = Date.now()
	const recent = (signInFailures.get(key) ?? []).filter(
		(failureTime) => now - failureTime < SIGN_IN_FAIL_WINDOW_MS
	)
	recent.push(now)
	signInFailures.set(key, recent)
	trimBackoffMap()
}

/** index.ts puts the caller's real address here, replacing anything the client sent. */
export const CLIENT_IP_HEADER = "x-ledger-client-ip"

/**
 * Logging in as someone else, or editing their email behind their back, isn't something this app
 * offers; leaving the endpoints reachable would only widen what a stolen admin session could do.
 */
export const DISABLED_PATHS = new Set([
	"/admin/impersonate-user",
	"/admin/stop-impersonating",
	"/admin/update-user",
	// Keys are only listed, created and deleted. Editing one (rate limits are server-only) or fetching it adds nothing.
	"/api-key/get",
	"/api-key/update",
	// Unused by the app. Revoking by session token names no user, so the owner guard below couldn't
	// stop another admin from listing the owner's devices and signing them out one by one.
	"/admin/list-user-sessions",
	"/admin/revoke-user-session",
])

/** Longest display name accepted anywhere a name is set. */
export const NAME_MAX = 100

/** What someone on a temporary password can still do: log in, see who they are, change it, leave. */
export const PASSWORD_CHANGE_ALLOWED = new Set([
	"/get-session",
	"/sign-out",
	"/change-password",
	"/sign-in/email",
	"/ok",
	"/error",
])

/** Endpoints that set a new password, and the body field that carries it. */
export const NEW_PASSWORD_FIELD = new Map([
	["/sign-up/email", "password"],
	["/change-password", "newPassword"],
	["/reset-password", "newPassword"],
	["/password/set", "newPassword"],
	["/admin/create-user", "password"],
	["/admin/set-user-password", "newPassword"],
])

/** Admin actions written to the audit log, with the label shown in Admin → Recent activity. */
export const AUDITED = new Map([
	["/admin/create-user", "Added user"],
	["/admin/set-role", "Changed role"],
	["/admin/set-user-password", "Set temporary password"],
	["/admin/revoke-user-sessions", "Logged out everywhere"],
	["/admin/ban-user", "Blocked login"],
	["/admin/unban-user", "Restored access"],
	["/admin/remove-user", "Deleted user"],
])

/**
 * Account events written to the audit log (and the server log), with their label. Failures of the
 * first group are logged too, so repeated wrong passwords or codes stand out.
 */
export const AUTH_EVENTS = new Map([
	["/sign-in/email", "Logged in"],
	["/sign-in/magic-link", "Requested login link"],
	["/sign-up/email", "Signed up"],
	["/two-factor/verify-totp", "Logged in"],
	["/two-factor/verify-backup-code", "Logged in"],
	["/change-password", "Changed password"],
	["/password/set", "Set a password"],
	["/delete-user", "Deleted own account"],
	["/delete-user/request-link", "Requested account deletion"],
	["/delete-user/callback", "Deleted own account"],
	["/verify-email", "Verified email"],
	["/send-verification-email", "Requested email verification"],
	["/two-factor/disable", "Turned off two-factor"],
	["/two-factor/generate-backup-codes", "Made new backup codes"],
	["/revoke-session", "Logged out a device"],
	["/revoke-other-sessions", "Logged out other devices"],
	["/revoke-sessions", "Logged out everywhere"],
	["/api-key/create", "Created API key"],
	["/api-key/delete", "Deleted API key"],
])
/** Auth audit actions that represent failed login attempts. */
export const AUDIT_FAILURES = new Set([
	"/sign-in/email",
	"/two-factor/verify-totp",
	"/two-factor/verify-backup-code",
	"/change-password",
	"/password/set",
	"/delete-user",
	"/delete-user/callback",
	"/verify-email",
	"/two-factor/disable",
])

/** Where a thrown redirect (an APIError with status FOUND) sends the browser, or null for anything else. */
export function redirectLocation(returned: unknown): string | null {
	if (!isAPIError(returned) || returned.status !== "FOUND") {
		return null
	}
	const headers = (
		returned as { headers?: Headers | { get(name: string): string | null } }
	).headers
	return headers?.get("location") ?? null
}

/** The `error` query value a redirect carries (Better Auth's way of reporting a failed link), or null. */
export function redirectErrorCode(returned: unknown): string | null {
	const location = redirectLocation(returned)
	if (!location) {
		return null
	}
	try {
		return new URL(location, "http://localhost").searchParams.get("error")
	} catch {
		return null
	}
}

/**
 * The address inside a verify-email token. Only call this once the endpoint has accepted the token,
 * since the payload is read without checking the signature.
 */
function emailFromVerificationToken(token: unknown): string | null {
	if (typeof token !== "string") {
		return null
	}
	try {
		const payload = JSON.parse(
			Buffer.from(token.split(".")[1] ?? "", "base64url").toString()
		) as { email?: unknown }
		return typeof payload.email === "string" ? payload.email : null
	} catch {
		return null
	}
}

/** Users deleting themselves through an emailed link, keyed by token: the session user is gone once the callback ran. */
export const deletionActors = new Map<string, { id: string; email: string }>()

/** The request pieces the audit helpers read. */
type HookCtx = { headers?: Headers; request?: Request }
/** Client IP from proxy headers for auth audit logging. */
export const clientIp = (context: HookCtx) =>
	context.headers?.get(CLIENT_IP_HEADER) ??
	context.request?.headers.get(CLIENT_IP_HEADER) ??
	null

type AuthUser = { id?: string; email?: string }

/** Logs one account event. Never lets a logging problem break the request itself. */
export function logAuthEvent(
	context: HookCtx & {
		path: string
		body?: unknown
		query?: unknown
		context: { session?: { user: AuthUser } | null }
	},
	returned: unknown
) {
	try {
		const label = AUTH_EVENTS.get(context.path)
		if (!label) {
			return
		}
		const body = context.body as { email?: unknown } | undefined
		const rawEmail = typeof body?.email === "string" ? body.email : null
		const bodyEmail =
			rawEmail && isPlausibleEmail(rawEmail)
				? rawEmail.trim().toLowerCase()
				: null
		const ip = clientIp(context)
		const sessionUser = context.context.session?.user
		// Link endpoints answer with a redirect, whose `error` parameter says whether it worked.
		const redirectError = redirectErrorCode(returned)
		if (
			isAPIError(returned) &&
			(returned.status !== "FOUND" || redirectError !== null)
		) {
			if (!AUDIT_FAILURES.has(context.path)) {
				return
			}
			if (context.path === "/sign-in/email" && rawEmail) {
				recordSignInFailure(rawEmail)
			}
			audit({
				kind: "auth",
				failed: true,
				ip,
				actorId: sessionUser?.id ?? null,
				actorEmail: sessionUser?.email ?? bodyEmail,
				action: label,
				detail: redirectError ?? returned.message ?? null,
			})
			return
		}
		const returnedResult = returned as {
			user?: AuthUser
			twoFactorRedirect?: boolean
			name?: string | null
		} | null
		const query = context.query as { token?: unknown } | undefined
		let user: AuthUser | undefined = returnedResult?.user ?? sessionUser
		if (context.path === "/delete-user/callback") {
			user =
				typeof query?.token === "string"
					? deletionActors.get(query.token)
					: user
		}
		if (context.path === "/verify-email") {
			const verifiedEmail = emailFromVerificationToken(query?.token)
			user = verifiedEmail ? { email: verifiedEmail } : user
		}
		let action = label
		let detail: string | null = null
		if (
			context.path === "/sign-in/email" &&
			returnedResult?.twoFactorRedirect
		) {
			action = "Password accepted"
			detail = "waiting for a two-factor code"
		}
		if (context.path.startsWith("/two-factor/verify-")) {
			// The same endpoint confirms the first code when turning two-factor on.
			if (sessionUser) {
				action = "Turned on two-factor"
			} else {
				detail =
					context.path === "/two-factor/verify-totp"
						? "with an authenticator code"
						: "with a backup code"
			}
		}
		if (context.path === "/api-key/create") {
			detail = returnedResult?.name ?? null
		}
		audit({
			kind: "auth",
			ip,
			actorId: user?.id ?? null,
			actorEmail: user?.email ?? bodyEmail,
			action,
			detail,
		})
	} catch (error) {
		console.error("[audit] could not record", context.path, error)
	}
}

/** Actions on the owner's account that only the owner may take. */
export const OWNER_PROTECTED = new Set([
	"/admin/set-role",
	"/admin/ban-user",
	"/admin/unban-user",
	"/admin/remove-user",
	"/admin/set-user-password",
	"/admin/revoke-user-sessions",
	"/admin/revoke-user-session",
])

/** Removed users' emails, kept from the before hook so the audit entry can still name them. */
export const removedEmails = new Map<string, string | null>()

/** AdminBody values accepted by validation and routes. */
export type AdminBody =
	| { userId?: unknown; role?: unknown; email?: unknown }
	| undefined

const validRole = (role: unknown) => role === "admin" || role === "user"

/**
 * The owner's account is off-limits to other admins, and only the owner hands out (or takes back)
 * admin. Nobody can change their own role, so the owner always stays an admin.
 */
export function guardOwner(path: string, actorId: string, body: AdminBody) {
	const ownerId = getOwnerId()
	const target = typeof body?.userId === "string" ? body.userId : null
	if (
		target &&
		target === ownerId &&
		actorId !== ownerId &&
		OWNER_PROTECTED.has(path)
	) {
		throw new APIError("FORBIDDEN", {
			message: "Only the owner can change the owner’s account.",
		})
	}
	if (path === "/admin/set-role") {
		if (actorId !== ownerId) {
			throw new APIError("FORBIDDEN", {
				message: "Only the owner can change who’s an admin.",
			})
		}
		if (target === actorId) {
			throw new APIError("BAD_REQUEST", {
				message: "You can’t change your own role.",
			})
		}
		if (!validRole(body?.role)) {
			throw new APIError("BAD_REQUEST", { message: "Unknown role." })
		}
	}
	// `data` is merged into the new user, role included, which would slip past the role check below.
	if (
		path === "/admin/create-user" &&
		(body as { data?: unknown } | undefined)?.data !== undefined
	) {
		throw new APIError("BAD_REQUEST", {
			message: "Unsupported field: data.",
		})
	}
	if (path === "/admin/create-user" && body?.role !== undefined) {
		if (!validRole(body.role)) {
			throw new APIError("BAD_REQUEST", { message: "Unknown role." })
		}
		if (body.role === "admin" && actorId !== ownerId) {
			throw new APIError("FORBIDDEN", {
				message: "Only the owner can add admins.",
			})
		}
	}
	if (path === "/admin/remove-user" && target) {
		removedEmails.set(target, emailOf(target))
	}
}
