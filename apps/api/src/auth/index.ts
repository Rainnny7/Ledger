import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
	isAPIError,
} from "better-auth/api"
import { admin, captcha, twoFactor } from "better-auth/plugins"
import { audit, emailOf, setMustChangePassword } from "../admin/store.ts"
import { endUserSessions } from "../banks/sessions.ts"
import { eq, notLike } from "drizzle-orm"
import { db, getSetting } from "../db/connection.ts"
import * as schema from "../db/schema/index.ts"
import { isDemoEmail, isDemoUserId } from "../demo/personas.ts"
import { env } from "../config/env.ts"
import {
	PASSWORD_MAX,
	PASSWORD_MIN,
	passwordProblem,
} from "@ledger/shared/password"
import { isCurrencyCode } from "../http/validation.ts"
import { isAccent, isThemeMode } from "@ledger/shared/themes"
import {
	AUDITED,
	CLIENT_IP_HEADER,
	DISABLED_PATHS,
	NAME_MAX,
	NEW_PASSWORD_FIELD,
	PASSWORD_CHANGE_ALLOWED,
	clientIp,
	guardOwner,
	logAuthEvent,
	removedEmails,
	signInBackoffBlocked,
	type AdminBody,
} from "./hooks.ts"
import { turnstileSecretKey } from "./captcha.ts"

/** Public export for routes and tests. */
export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	secret: env.APP_SECRET,
	baseURL: env.APP_URL,
	basePath: "/api/auth",
	trustedOrigins: [env.APP_URL],
	emailAndPassword: {
		enabled: true,
		minPasswordLength: PASSWORD_MIN,
		maxPasswordLength: PASSWORD_MAX,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		// "Fresh session" checks would make Settings → Devices fail a day after login. The one sensitive
		// action they guard here, deleting the account, always requires the password instead (hook below).
		freshAge: 0,
	},
	hooks: {
		before: createAuthMiddleware(async (context) => {
			// The session is gone by the time the after hook runs, so sign-outs are logged here.
			if (context.path === "/sign-out") {
				const current = await getSessionFromCtx(context).catch(
					() => null
				)
				if (current) {
					audit({
						kind: "auth",
						ip: clientIp(context),
						actorId: current.user.id,
						actorEmail: current.user.email,
						action: "Logged out",
					})
				}
			}
			if (
				context.path === "/delete-user" &&
				!(context.body as { password?: unknown } | undefined)?.password
			) {
				throw new APIError("BAD_REQUEST", {
					message: "Enter your password to delete your account.",
				})
			}
			// The demo user's address is reserved, and it isn't a real account to manage.
			const body = context.body as AdminBody
			if (typeof body?.email === "string" && isDemoEmail(body.email)) {
				throw new APIError("BAD_REQUEST", {
					message: "That email address is reserved.",
				})
			}
			if (
				context.path.startsWith("/admin/") &&
				typeof body?.userId === "string" &&
				isDemoUserId(body.userId)
			) {
				throw new APIError("BAD_REQUEST", {
					message: "The demo account can’t be changed.",
				})
			}
			if (
				(context.path === "/update-user" ||
					context.path === "/sign-up/email") &&
				(context.body as { currency?: unknown } | undefined)
					?.currency != null
			) {
				const currency = (context.body as { currency?: unknown })
					.currency
				if (!isCurrencyCode(currency)) {
					throw new APIError("BAD_REQUEST", {
						message: "Unknown currency.",
					})
				}
			}
			if (
				context.path === "/update-user" &&
				(context.body as { theme?: unknown } | undefined)?.theme != null
			) {
				if (!isThemeMode((context.body as { theme?: unknown }).theme)) {
					throw new APIError("BAD_REQUEST", {
						message: "Unknown theme.",
					})
				}
			}
			if (
				context.path === "/update-user" &&
				(context.body as { accent?: unknown } | undefined)?.accent !=
					null
			) {
				if (!isAccent((context.body as { accent?: unknown }).accent)) {
					throw new APIError("BAD_REQUEST", {
						message: "Unknown accent colour.",
					})
				}
			}
			if (
				context.path === "/update-user" ||
				context.path === "/sign-up/email" ||
				context.path === "/admin/create-user"
			) {
				const name = (context.body as { name?: unknown } | undefined)
					?.name
				if (
					name !== undefined &&
					(typeof name !== "string" || name.trim().length > NAME_MAX)
				) {
					throw new APIError("BAD_REQUEST", {
						message: `Use a name of at most ${NAME_MAX} characters.`,
					})
				}
			}
			if (DISABLED_PATHS.has(context.path)) {
				throw new APIError("NOT_FOUND", { message: "Not available." })
			}
			if (context.path === "/sign-in/email") {
				const email = (context.body as { email?: unknown } | undefined)
					?.email
				if (typeof email === "string" && signInBackoffBlocked(email)) {
					throw new APIError("TOO_MANY_REQUESTS", {
						message:
							"Too many failed login attempts. Try again later.",
					})
				}
			}
			// New passwords must meet the complexity rules, wherever they're set from.
			const newPasswordField = NEW_PASSWORD_FIELD.get(context.path)
			if (newPasswordField) {
				const value = (
					context.body as Record<string, unknown> | undefined
				)?.[newPasswordField]
				const problem =
					typeof value === "string" ? passwordProblem(value) : null
				if (problem) {
					throw new APIError("BAD_REQUEST", {
						message: problem,
						code: "WEAK_PASSWORD",
					})
				}
			}

			const twoFactorVerify =
				context.path === "/two-factor/verify-totp" ||
				context.path === "/two-factor/verify-backup-code"
			if (PASSWORD_CHANGE_ALLOWED.has(context.path) || twoFactorVerify) {
				return
			}
			const session = await getSessionFromCtx(context)
			if (!session) {
				return
			}
			// Logged in with a temporary password: nothing else works until it's replaced.
			if (
				(session.user as { mustChangePassword?: boolean })
					.mustChangePassword
			) {
				throw new APIError("FORBIDDEN", {
					message: "Choose a new password to continue.",
					code: "PASSWORD_CHANGE_REQUIRED",
				})
			}
			if (
				context.path.startsWith("/admin/") &&
				session.user.role === "admin"
			) {
				guardOwner(context.path, session.user.id, body)
			}
		}),
		after: createAuthMiddleware(async (context) => {
			const returned = context.context.returned
			if (returned instanceof Response) {
				return
			}
			logAuthEvent(context, returned)
			if (
				returned === undefined ||
				returned === null ||
				isAPIError(returned)
			) {
				return
			}
			const body = context.body as AdminBody
			const userId = typeof body?.userId === "string" ? body.userId : null

			if (context.path === "/change-password") {
				const id = (returned as { user?: { id?: string } }).user?.id
				if (id) {
					setMustChangePassword(id, false)
				}
				return
			}
			const action = AUDITED.get(context.path)
			if (!action) {
				return
			}

			let targetId = userId
			let detail: string | null = null
			if (context.path === "/admin/create-user") {
				targetId =
					(returned as { user?: { id?: string } }).user?.id ?? null
				// Accounts an admin creates start on a temporary password.
				if (targetId) {
					setMustChangePassword(targetId, true)
				}
				if (body?.role === "admin") {
					detail = "as admin"
				}
			}
			if (context.path === "/admin/set-user-password" && userId) {
				// A temporary password: they choose their own at next login, and every device signs out now.
				setMustChangePassword(userId, true)
				db.delete(schema.session)
					.where(eq(schema.session.userId, userId))
					.run()
				await endUserSessions(userId)
			}
			// A banned user's bank logins in progress stop with their sessions.
			if (context.path === "/admin/ban-user" && userId) {
				await endUserSessions(userId)
			}
			if (context.path === "/admin/set-role") {
				detail = `to ${String(body?.role)}`
			}

			let targetEmail = targetId ? emailOf(targetId) : null
			if (context.path === "/admin/remove-user" && userId) {
				targetEmail = removedEmails.get(userId) ?? null
				removedEmails.delete(userId)
			}
			const actor = context.context.session?.user
			audit({
				kind: "admin",
				ip: clientIp(context),
				actorId: actor?.id ?? null,
				actorEmail: actor?.email ?? null,
				action,
				targetId,
				targetEmail,
				detail,
			})
		}),
	},
	user: {
		// Settings → Delete account. Every app table references user(id) ON DELETE CASCADE, so removing
		// the user also removes their connections, accounts, transactions, rules and subscriptions.
		deleteUser: { enabled: true },
		additionalFields: {
			// Set when an admin creates the account or sets a temporary password; cleared by /change-password.
			mustChangePassword: {
				type: "boolean",
				defaultValue: false,
				input: false,
				required: false,
			},
			// Settings → Preferences: count the overdraft you can draw on as part of your balances.
			includeOverdraft: {
				type: "boolean",
				defaultValue: true,
				input: true,
				required: false,
			},
			// Settings → Preferences: the currency totals are shown in. Guessed from the browser at sign-up.
			currency: { type: "string", input: true, required: false },
			// Settings → Appearance: the mode (system / light / dark / AMOLED) and accent colour, so they follow you to every device. Unset until picked.
			theme: { type: "string", input: true, required: false },
			accent: { type: "string", input: true, required: false },
			// Cleared for new accounts; set when onboarding is skipped, closed or finished.
			onboardingCompletedAt: {
				type: "date",
				input: true,
				required: false,
			},
		},
	},
	databaseHooks: {
		user: {
			create: {
				// The very first account runs the instance.
				before: async (user) => {
					if (hasRealUsers()) {
						return
					}
					return { data: { ...user, role: "admin" } }
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
		twoFactor({ issuer: "Ledger" }),
		// Settings → Admin: list, create, ban and remove users.
		admin({
			defaultRole: "user",
			adminRoles: ["admin"],
			bannedUserMessage:
				"Your access to this Ledger has been turned off. Ask its admin to restore it.",
		}),
		// Invisible Cloudflare Turnstile on sign-in and sign-up, when both keys are configured.
		...(turnstileSecretKey
			? [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: turnstileSecretKey,
						endpoints: ["/sign-in/email", "/sign-up/email"],
					}),
				]
			: []),
	],
	// Throttle password guessing (in-memory; this is a single-process app). On by default only in production.
	rateLimit: {
		enabled: true,
		window: 60,
		max: 100,
		customRules: {
			"/sign-in/email": { window: 60, max: 5 },
			"/sign-up/email": { window: 60, max: 3 },
			"/two-factor/verify-totp": { window: 60, max: 5 },
			"/two-factor/verify-backup-code": { window: 60, max: 5 },
			"/delete-user": { window: 60, max: 3 },
			"/change-password": { window: 60, max: 5 },
			"/admin/set-user-password": { window: 60, max: 10 },
			"/admin/create-user": { window: 60, max: 10 },
		},
	},
	advanced: {
		// Rate limits key on the caller's address. Reading it from a header the client can't forge
		// (see index.ts) stops anyone dodging the login limit with a made-up X-Forwarded-For.
		ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
	},
})

/**
 * Whether people may sign themselves up. The first account can always be created; after that an
 * admin decides (Admin → Feature flags), starting from ALLOW_REGISTRATION. Admins can add users either way.
 */
export function registrationOpen() {
	if (!hasRealUsers()) {
		return true
	}
	const setting = getSetting("registration_open")
	return setting === null ? env.ALLOW_REGISTRATION : setting === "true"
}

/**
 * Whether admins have left AI chat on. Defaults to enabled; an API key is still required for chat to work.
 */
export function aiChatEnabled() {
	const setting = getSetting("ai_chat_enabled")
	return setting === null ? true : setting === "true"
}

/** Whether the MCP server is switched on. Off by default: admins opt in because it lets users hand their finances to outside AI clients. */
export function mcpEnabled() {
	return getSetting("mcp_enabled") === "true"
}

/** Whether signed-in users may use AI chat (gateway key present and the feature flag is on). */
export function aiChatAvailable() {
	return Boolean(env.AI_API_KEY) && aiChatEnabled()
}

/** Whether anyone besides the built-in demo user has an account. */
function hasRealUsers() {
	return !!db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(notLike(schema.user.id, "ledger-demo%"))
		.limit(1)
		.get()
}
