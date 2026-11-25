import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api'
import { getMigrations } from 'better-auth/db/migration'
import { admin, twoFactor } from 'better-auth/plugins'
import { audit, emailOf, getOwnerId, setMustChangePassword } from './admin.ts'
import { endUserSessions } from './banks/sessions.ts'
import { db, getSetting } from './db.ts'
import { DEMO_EMAIL, DEMO_USER_ID } from './demo.ts'
import { env } from './env.ts'
import { PASSWORD_MAX, PASSWORD_MIN, passwordProblem } from '../shared/password.ts'
import { isCurrencyCode } from './validation.ts'
import { isThemeChoice } from '../shared/themes.ts'

/** index.ts puts the caller's real address here, replacing anything the client sent. */
export const CLIENT_IP_HEADER = 'x-ledger-client-ip'

/**
 * Signing in as someone else, or editing their email behind their back, isn't something this app
 * offers; leaving the endpoints reachable would only widen what a stolen admin session could do.
 */
const DISABLED_PATHS = new Set([
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  '/admin/update-user',
  // Unused by the app. Revoking by session token names no user, so the owner guard below couldn't
  // stop another admin from listing the owner's devices and signing them out one by one.
  '/admin/list-user-sessions',
  '/admin/revoke-user-session',
])

/** Longest display name accepted anywhere a name is set. */
const NAME_MAX = 100

/** What someone on a temporary password can still do: sign in, see who they are, change it, leave. */
const PASSWORD_CHANGE_ALLOWED = new Set(['/get-session', '/sign-out', '/change-password', '/sign-in/email', '/ok', '/error'])

/** Endpoints that set a new password, and the body field that carries it. */
const NEW_PASSWORD_FIELD = new Map([
  ['/sign-up/email', 'password'],
  ['/change-password', 'newPassword'],
  ['/reset-password', 'newPassword'],
  ['/admin/create-user', 'password'],
  ['/admin/set-user-password', 'newPassword'],
])

/** Admin actions written to the audit log, with the label shown in Admin → Recent activity. */
const AUDITED = new Map([
  ['/admin/create-user', 'Added user'],
  ['/admin/set-role', 'Changed role'],
  ['/admin/set-user-password', 'Set temporary password'],
  ['/admin/revoke-user-sessions', 'Signed out everywhere'],
  ['/admin/ban-user', 'Blocked sign-in'],
  ['/admin/unban-user', 'Restored access'],
  ['/admin/remove-user', 'Deleted user'],
])

/**
 * Account events written to the audit log (and the server log), with their label. Failures of the
 * first group are logged too, so repeated wrong passwords or codes stand out.
 */
const AUTH_EVENTS = new Map([
  ['/sign-in/email', 'Signed in'],
  ['/sign-up/email', 'Signed up'],
  ['/two-factor/verify-totp', 'Signed in'],
  ['/two-factor/verify-backup-code', 'Signed in'],
  ['/change-password', 'Changed password'],
  ['/delete-user', 'Deleted own account'],
  ['/two-factor/disable', 'Turned off two-factor'],
  ['/two-factor/generate-backup-codes', 'Made new backup codes'],
  ['/revoke-session', 'Signed out a device'],
  ['/revoke-other-sessions', 'Signed out other devices'],
  ['/revoke-sessions', 'Signed out everywhere'],
])
const AUDIT_FAILURES = new Set([
  '/sign-in/email',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
  '/change-password',
  '/delete-user',
  '/two-factor/disable',
])

type HookCtx = { headers?: Headers; request?: Request }
const clientIp = (ctx: HookCtx) => ctx.headers?.get(CLIENT_IP_HEADER) ?? ctx.request?.headers.get(CLIENT_IP_HEADER) ?? null

type AuthUser = { id?: string; email?: string }

/** Logs one account event. Never lets a logging problem break the request itself. */
function logAuthEvent(ctx: HookCtx & { path: string; body?: unknown; context: { session?: { user: AuthUser } | null } }, returned: unknown) {
  try {
    const label = AUTH_EVENTS.get(ctx.path)
    if (!label) return
    const body = ctx.body as { email?: unknown } | undefined
    const bodyEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null
    const ip = clientIp(ctx)
    const sessionUser = ctx.context.session?.user
    if (isAPIError(returned)) {
      if (!AUDIT_FAILURES.has(ctx.path)) return
      audit({ kind: 'auth', failed: true, ip, actorId: sessionUser?.id ?? null, actorEmail: sessionUser?.email ?? bodyEmail, action: label, detail: returned.message || null })
      return
    }
    const r = returned as { user?: AuthUser; twoFactorRedirect?: boolean } | null
    const user = r?.user ?? sessionUser
    let action = label
    let detail: string | null = null
    if (ctx.path === '/sign-in/email' && r?.twoFactorRedirect) {
      action = 'Password accepted'
      detail = 'waiting for a two-factor code'
    }
    if (ctx.path.startsWith('/two-factor/verify-')) {
      // The same endpoint confirms the first code when turning two-factor on.
      if (sessionUser) action = 'Turned on two-factor'
      else detail = ctx.path === '/two-factor/verify-totp' ? 'with an authenticator code' : 'with a backup code'
    }
    audit({ kind: 'auth', ip, actorId: user?.id ?? null, actorEmail: user?.email ?? bodyEmail, action, detail })
  } catch (err) {
    console.error('[audit] could not record', ctx.path, err)
  }
}

/** Actions on the owner's account that only the owner may take. */
const OWNER_PROTECTED = new Set([
  '/admin/set-role',
  '/admin/ban-user',
  '/admin/unban-user',
  '/admin/remove-user',
  '/admin/set-user-password',
  '/admin/revoke-user-sessions',
  '/admin/revoke-user-session',
])

/** Removed users' emails, kept from the before hook so the audit entry can still name them. */
const removedEmails = new Map<string, string | null>()

type AdminBody = { userId?: unknown; role?: unknown; email?: unknown } | undefined

/**
 * The owner's account is off-limits to other admins, and only the owner hands out (or takes back)
 * admin. Nobody can change their own role, so the owner always stays an admin.
 */
function guardOwner(path: string, actorId: string, body: AdminBody) {
  const ownerId = getOwnerId()
  const target = typeof body?.userId === 'string' ? body.userId : null
  const validRole = (r: unknown) => r === 'admin' || r === 'user'
  if (target && target === ownerId && actorId !== ownerId && OWNER_PROTECTED.has(path)) {
    throw new APIError('FORBIDDEN', { message: 'Only the owner can change the owner’s account.' })
  }
  if (path === '/admin/set-role') {
    if (actorId !== ownerId) throw new APIError('FORBIDDEN', { message: 'Only the owner can change who’s an admin.' })
    if (target === actorId) throw new APIError('BAD_REQUEST', { message: 'You can’t change your own role.' })
    if (!validRole(body?.role)) throw new APIError('BAD_REQUEST', { message: 'Unknown role.' })
  }
  // `data` is merged into the new user, role included, which would slip past the role check below.
  if (path === '/admin/create-user' && (body as { data?: unknown } | undefined)?.data !== undefined) {
    throw new APIError('BAD_REQUEST', { message: 'Unsupported field: data.' })
  }
  if (path === '/admin/create-user' && body?.role !== undefined) {
    if (!validRole(body.role)) throw new APIError('BAD_REQUEST', { message: 'Unknown role.' })
    if (body.role === 'admin' && actorId !== ownerId) throw new APIError('FORBIDDEN', { message: 'Only the owner can add admins.' })
  }
  if (path === '/admin/remove-user' && target) removedEmails.set(target, emailOf(target))
}

export const auth = betterAuth({
  database: db,
  secret: env.secret,
  baseURL: env.appUrl,
  basePath: '/api/auth',
  trustedOrigins: [env.appUrl],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    // "Fresh session" checks would make Settings → Devices fail a day after sign-in. The one sensitive
    // action they guard here, deleting the account, always requires the password instead (hook below).
    freshAge: 0,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // The session is gone by the time the after hook runs, so sign-outs are logged here.
      if (ctx.path === '/sign-out') {
        const current = await getSessionFromCtx(ctx).catch(() => null)
        if (current) audit({ kind: 'auth', ip: clientIp(ctx), actorId: current.user.id, actorEmail: current.user.email, action: 'Signed out' })
      }
      if (ctx.path === '/delete-user' && !(ctx.body as { password?: unknown } | undefined)?.password) {
        throw new APIError('BAD_REQUEST', { message: 'Enter your password to delete your account.' })
      }
      // The demo user's address is reserved, and it isn't a real account to manage.
      const body = ctx.body as AdminBody
      if (typeof body?.email === 'string' && body.email.trim().toLowerCase() === DEMO_EMAIL) {
        throw new APIError('BAD_REQUEST', { message: 'That email address is reserved.' })
      }
      if (ctx.path.startsWith('/admin/') && body?.userId === DEMO_USER_ID) {
        throw new APIError('BAD_REQUEST', { message: 'The demo account can’t be changed.' })
      }
      if ((ctx.path === '/update-user' || ctx.path === '/sign-up/email') && (ctx.body as { currency?: unknown } | undefined)?.currency != null) {
        const currency = (ctx.body as { currency?: unknown }).currency
        if (!isCurrencyCode(currency)) throw new APIError('BAD_REQUEST', { message: 'Unknown currency.' })
      }
      if (ctx.path === '/update-user' && (ctx.body as { theme?: unknown } | undefined)?.theme != null) {
        if (!isThemeChoice((ctx.body as { theme?: unknown }).theme)) throw new APIError('BAD_REQUEST', { message: 'Unknown theme.' })
      }
      if (ctx.path === '/update-user' || ctx.path === '/sign-up/email' || ctx.path === '/admin/create-user') {
        const name = (ctx.body as { name?: unknown } | undefined)?.name
        if (name !== undefined && (typeof name !== 'string' || name.trim().length > NAME_MAX)) {
          throw new APIError('BAD_REQUEST', { message: `Use a name of at most ${NAME_MAX} characters.` })
        }
      }
      if (DISABLED_PATHS.has(ctx.path)) throw new APIError('NOT_FOUND', { message: 'Not available.' })
      // New passwords must meet the complexity rules, wherever they're set from.
      const newPasswordField = NEW_PASSWORD_FIELD.get(ctx.path)
      if (newPasswordField) {
        const value = (ctx.body as Record<string, unknown> | undefined)?.[newPasswordField]
        const problem = typeof value === 'string' ? passwordProblem(value) : null
        if (problem) throw new APIError('BAD_REQUEST', { message: problem, code: 'WEAK_PASSWORD' })
      }

      if (PASSWORD_CHANGE_ALLOWED.has(ctx.path) || ctx.path.startsWith('/two-factor/')) return
      const session = await getSessionFromCtx(ctx)
      if (!session) return
      // Signed in with a temporary password: nothing else works until it's replaced.
      if ((session.user as { mustChangePassword?: boolean }).mustChangePassword) {
        throw new APIError('FORBIDDEN', { message: 'Choose a new password to continue.', code: 'PASSWORD_CHANGE_REQUIRED' })
      }
      if (ctx.path.startsWith('/admin/') && session.user.role === 'admin') guardOwner(ctx.path, session.user.id, body)
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned
      if (returned instanceof Response) return
      logAuthEvent(ctx, returned)
      if (returned === undefined || returned === null || isAPIError(returned)) return
      const body = ctx.body as AdminBody
      const userId = typeof body?.userId === 'string' ? body.userId : null

      if (ctx.path === '/change-password') {
        const id = (returned as { user?: { id?: string } }).user?.id
        if (id) setMustChangePassword(id, false)
        return
      }
      const action = AUDITED.get(ctx.path)
      if (!action) return

      let targetId = userId
      let detail: string | null = null
      if (ctx.path === '/admin/create-user') {
        targetId = (returned as { user?: { id?: string } }).user?.id ?? null
        // Accounts an admin creates start on a temporary password.
        if (targetId) setMustChangePassword(targetId, true)
        if (body?.role === 'admin') detail = 'as admin'
      }
      if (ctx.path === '/admin/set-user-password' && userId) {
        // A temporary password: they choose their own at next sign-in, and every device signs out now.
        setMustChangePassword(userId, true)
        db.prepare(`DELETE FROM session WHERE userId = ?`).run(userId)
        await endUserSessions(userId)
      }
      // A banned user's bank logins in progress stop with their sessions.
      if (ctx.path === '/admin/ban-user' && userId) await endUserSessions(userId)
      if (ctx.path === '/admin/set-role') detail = `to ${String(body?.role)}`

      let targetEmail = targetId ? emailOf(targetId) : null
      if (ctx.path === '/admin/remove-user' && userId) {
        targetEmail = removedEmails.get(userId) ?? null
        removedEmails.delete(userId)
      }
      const actor = ctx.context.session?.user
      audit({ kind: 'admin', ip: clientIp(ctx), actorId: actor?.id ?? null, actorEmail: actor?.email ?? null, action, targetId, targetEmail, detail })
    }),
  },
  user: {
    // Settings → Delete account. Every app table references user(id) ON DELETE CASCADE, so removing
    // the user also removes their connections, accounts, transactions, rules and subscriptions.
    deleteUser: { enabled: true },
    additionalFields: {
      // Set when an admin creates the account or sets a temporary password; cleared by /change-password.
      mustChangePassword: { type: 'boolean', defaultValue: false, input: false, required: false },
      // Settings → Preferences: count the overdraft you can draw on as part of your balances.
      includeOverdraft: { type: 'boolean', defaultValue: true, input: true, required: false },
      // Settings → Preferences: the currency totals are shown in. Guessed from the browser at sign-up.
      currency: { type: 'string', input: true, required: false },
      // Settings → Appearance: the colour theme, so it follows you to every device. Unset until picked.
      theme: { type: 'string', input: true, required: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // The very first account runs the instance.
        before: async (user) => {
          if (hasRealUsers()) return
          return { data: { ...user, role: 'admin' } }
        },
      },
      // Runs for self-deletion and for an admin removing someone.
      delete: {
        before: async (user) => {
          await endUserSessions(user.id)
        },
      },
    },
  },
  plugins: [
    // Authenticator-app (TOTP) two-factor with one-time backup codes.
    twoFactor({ issuer: 'Ledger' }),
    // Settings → Admin: list, create, ban and remove users.
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
      bannedUserMessage: 'Your access to this Ledger has been turned off. Ask its admin to restore it.',
    }),
  ],
  // Throttle password guessing (in-memory; this is a single-process app). On by default only in production.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 3 },
      '/two-factor/verify-totp': { window: 60, max: 5 },
      '/two-factor/verify-backup-code': { window: 60, max: 5 },
      '/delete-user': { window: 60, max: 3 },
      '/change-password': { window: 60, max: 5 },
      '/admin/set-user-password': { window: 60, max: 10 },
      '/admin/create-user': { window: 60, max: 10 },
    },
  },
  advanced: {
    // Rate limits key on the caller's address. Reading it from a header the client can't forge
    // (see index.ts) stops anyone dodging the sign-in limit with a made-up X-Forwarded-For.
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },
})

/**
 * Whether people may sign themselves up. The first account can always be created; after that an
 * admin decides (Admin → Sign-ups), starting from ALLOW_REGISTRATION. Admins can add users either way.
 */
export function registrationOpen() {
  if (!hasRealUsers()) return true
  const setting = getSetting('registration_open')
  return setting === null ? env.allowRegistration : setting === 'true'
}

export async function migrateAuthTables() {
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
  // Instances from before the admin area: the oldest account becomes the admin.
  const hasAdmin = db.prepare(`SELECT 1 FROM user WHERE role = 'admin' LIMIT 1`).get()
  if (!hasAdmin) {
    db.prepare(`UPDATE user SET role = 'admin' WHERE id = (SELECT id FROM user WHERE id != ? ORDER BY createdAt LIMIT 1)`).run(DEMO_USER_ID)
  }
}

/** Whether anyone besides the built-in demo user has an account. */
function hasRealUsers() {
  return !!db.prepare(`SELECT 1 FROM user WHERE id != ? LIMIT 1`).get(DEMO_USER_ID)
}
