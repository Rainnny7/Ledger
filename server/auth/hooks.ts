import { APIError, isAPIError } from "better-auth/api"
import { audit, emailOf, getOwnerId } from "../admin.ts"

const SIGN_IN_FAIL_WINDOW_MS = 15 * 60 * 1000
const SIGN_IN_FAIL_MAX = 10
const BACKOFF_CAP = 5000
const signInFailures = new Map<string, number[]>()

/** Shape check only — not deliverability; keeps failed sign-in audits from junk input. */
export function isPlausibleEmail(email: string): boolean {
  const e = email.trim()
  return (
    e.length > 0 &&
    e.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) &&
    !/[\r\n\0]/.test(e)
  )
}

function trimBackoffMap() {
  if (signInFailures.size <= BACKOFF_CAP) return
  const now = Date.now()
  for (const [key, times] of signInFailures) {
    const live = times.filter((t) => now - t < SIGN_IN_FAIL_WINDOW_MS)
    if (live.length === 0) signInFailures.delete(key)
    else signInFailures.set(key, live)
    if (signInFailures.size <= BACKOFF_CAP) break
  }
}

/** Per-email sign-in backoff (in memory, bounded). */
export function signInBackoffBlocked(email: string): boolean {
  const key = email.trim().toLowerCase()
  const now = Date.now()
  const recent = (signInFailures.get(key) ?? []).filter(
    (t) => now - t < SIGN_IN_FAIL_WINDOW_MS
  )
  signInFailures.set(key, recent)
  trimBackoffMap()
  return recent.length >= SIGN_IN_FAIL_MAX
}

export function recordSignInFailure(email: string) {
  if (!isPlausibleEmail(email)) return
  const key = email.trim().toLowerCase()
  const now = Date.now()
  const recent = (signInFailures.get(key) ?? []).filter(
    (t) => now - t < SIGN_IN_FAIL_WINDOW_MS
  )
  recent.push(now)
  signInFailures.set(key, recent)
  trimBackoffMap()
}

/** index.ts puts the caller's real address here, replacing anything the client sent. */
export const CLIENT_IP_HEADER = "x-ledger-client-ip"

/**
 * Signing in as someone else, or editing their email behind their back, isn't something this app
 * offers; leaving the endpoints reachable would only widen what a stolen admin session could do.
 */
export const DISABLED_PATHS = new Set([
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
  "/admin/update-user",
  // Unused by the app. Revoking by session token names no user, so the owner guard below couldn't
  // stop another admin from listing the owner's devices and signing them out one by one.
  "/admin/list-user-sessions",
  "/admin/revoke-user-session",
])

/** Longest display name accepted anywhere a name is set. */
export const NAME_MAX = 100

/** What someone on a temporary password can still do: sign in, see who they are, change it, leave. */
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
  ["/admin/create-user", "password"],
  ["/admin/set-user-password", "newPassword"],
])

/** Admin actions written to the audit log, with the label shown in Admin → Recent activity. */
export const AUDITED = new Map([
  ["/admin/create-user", "Added user"],
  ["/admin/set-role", "Changed role"],
  ["/admin/set-user-password", "Set temporary password"],
  ["/admin/revoke-user-sessions", "Signed out everywhere"],
  ["/admin/ban-user", "Blocked sign-in"],
  ["/admin/unban-user", "Restored access"],
  ["/admin/remove-user", "Deleted user"],
])

/**
 * Account events written to the audit log (and the server log), with their label. Failures of the
 * first group are logged too, so repeated wrong passwords or codes stand out.
 */
export const AUTH_EVENTS = new Map([
  ["/sign-in/email", "Signed in"],
  ["/sign-up/email", "Signed up"],
  ["/two-factor/verify-totp", "Signed in"],
  ["/two-factor/verify-backup-code", "Signed in"],
  ["/change-password", "Changed password"],
  ["/delete-user", "Deleted own account"],
  ["/two-factor/disable", "Turned off two-factor"],
  ["/two-factor/generate-backup-codes", "Made new backup codes"],
  ["/revoke-session", "Signed out a device"],
  ["/revoke-other-sessions", "Signed out other devices"],
  ["/revoke-sessions", "Signed out everywhere"],
])
export const AUDIT_FAILURES = new Set([
  "/sign-in/email",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/change-password",
  "/delete-user",
  "/two-factor/disable",
])

type HookCtx = { headers?: Headers; request?: Request }
export const clientIp = (ctx: HookCtx) =>
  ctx.headers?.get(CLIENT_IP_HEADER) ??
  ctx.request?.headers.get(CLIENT_IP_HEADER) ??
  null

type AuthUser = { id?: string; email?: string }

/** Logs one account event. Never lets a logging problem break the request itself. */
export function logAuthEvent(
  ctx: HookCtx & {
    path: string
    body?: unknown
    context: { session?: { user: AuthUser } | null }
  },
  returned: unknown
) {
  try {
    const label = AUTH_EVENTS.get(ctx.path)
    if (!label) return
    const body = ctx.body as { email?: unknown } | undefined
    const rawEmail = typeof body?.email === "string" ? body.email : null
    const bodyEmail =
      rawEmail && isPlausibleEmail(rawEmail)
        ? rawEmail.trim().toLowerCase()
        : null
    const ip = clientIp(ctx)
    const sessionUser = ctx.context.session?.user
    if (isAPIError(returned)) {
      if (!AUDIT_FAILURES.has(ctx.path)) return
      if (ctx.path === "/sign-in/email" && rawEmail)
        recordSignInFailure(rawEmail)
      audit({
        kind: "auth",
        failed: true,
        ip,
        actorId: sessionUser?.id ?? null,
        actorEmail: sessionUser?.email ?? bodyEmail,
        action: label,
        detail: returned.message || null,
      })
      return
    }
    const r = returned as {
      user?: AuthUser
      twoFactorRedirect?: boolean
    } | null
    const user = r?.user ?? sessionUser
    let action = label
    let detail: string | null = null
    if (ctx.path === "/sign-in/email" && r?.twoFactorRedirect) {
      action = "Password accepted"
      detail = "waiting for a two-factor code"
    }
    if (ctx.path.startsWith("/two-factor/verify-")) {
      // The same endpoint confirms the first code when turning two-factor on.
      if (sessionUser) action = "Turned on two-factor"
      else
        detail =
          ctx.path === "/two-factor/verify-totp"
            ? "with an authenticator code"
            : "with a backup code"
    }
    audit({
      kind: "auth",
      ip,
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? bodyEmail,
      action,
      detail,
    })
  } catch (err) {
    console.error("[audit] could not record", ctx.path, err)
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

export type AdminBody =
  | { userId?: unknown; role?: unknown; email?: unknown }
  | undefined

const validRole = (r: unknown) => r === "admin" || r === "user"

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
    if (actorId !== ownerId)
      throw new APIError("FORBIDDEN", {
        message: "Only the owner can change who’s an admin.",
      })
    if (target === actorId)
      throw new APIError("BAD_REQUEST", {
        message: "You can’t change your own role.",
      })
    if (!validRole(body?.role))
      throw new APIError("BAD_REQUEST", { message: "Unknown role." })
  }
  // `data` is merged into the new user, role included, which would slip past the role check below.
  if (
    path === "/admin/create-user" &&
    (body as { data?: unknown } | undefined)?.data !== undefined
  ) {
    throw new APIError("BAD_REQUEST", { message: "Unsupported field: data." })
  }
  if (path === "/admin/create-user" && body?.role !== undefined) {
    if (!validRole(body.role))
      throw new APIError("BAD_REQUEST", { message: "Unknown role." })
    if (body.role === "admin" && actorId !== ownerId)
      throw new APIError("FORBIDDEN", {
        message: "Only the owner can add admins.",
      })
  }
  if (path === "/admin/remove-user" && target)
    removedEmails.set(target, emailOf(target))
}
