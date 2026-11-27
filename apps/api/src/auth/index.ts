import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
	isAPIError,
} from "better-auth/api"
import { apiKey } from "@better-auth/api-key"
import { admin, captcha, magicLink, twoFactor } from "better-auth/plugins"
import {
	API_KEY_MAX_EXPIRY_DAYS,
	API_KEY_NAME_MAX,
	API_KEY_PREFIX,
	API_KEY_RATE_LIMIT_MAX,
	API_KEY_RATE_LIMIT_WINDOW_MS,
	MAX_API_KEYS_PER_USER,
	countApiKeys,
} from "../api-keys/config.ts"
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
	RECENT_LOGIN_MAX_MS,
	clientIp,
	guardOwner,
	logAuthEvent,
	emailResendCooldownBlocked,
	emailResendCooldownRemainingSeconds,
	deletionActors,
	recordEmailResendSent,
	removedEmails,
	signInBackoffBlocked,
	type AdminBody,
} from "./hooks.ts"
import {
	discardPasswordSetBeforeEmailProof,
	userHasCredentialPassword,
} from "./credentials.ts"
import {
	auditMagicLinkVerify,
	markMagicLinkSignUp,
	redirectBannedMagicLinkVerify,
} from "./magic-link-audit.ts"
import { MAGIC_LINK_COOLDOWN_KIND, magicLinkGuard } from "./magic-link-guard.ts"
import { passwordPlugin } from "./password-plugin.ts"
import { turnstileSecretKey } from "./captcha.ts"
import { magicLinkMailContent } from "../mail/magic-link.ts"
import { verifyEmailMailContent } from "../mail/verify-email.ts"
import { isSmtpConfigured, sendMail } from "../mail/smtp.ts"

/** Context passed to auth middleware hooks (before/after). */
export type AuthMiddlewareContext = Parameters<
	Parameters<typeof createAuthMiddleware>[0]
>[0]

/** How long the pending second-factor step stays valid after a login link is clicked, matching the 2FA plugin. */
const TWO_FACTOR_PENDING_SECONDS = 600

/** Two-factor endpoints that, for an account without a password, have nothing but the session to vouch for the caller. */
const TWO_FACTOR_SENSITIVE_PATHS = new Set([
	"/two-factor/enable",
	"/two-factor/disable",
	"/two-factor/get-totp-uri",
	"/two-factor/generate-backup-codes",
])

/**
 * Setting a first password, and changing two-factor on an account without a password, need a login
 * from the last few minutes, so a stolen long-lived session can't lock in permanent access.
 */
async function requireRecentLogin(context: AuthMiddlewareContext) {
	const session = await getSessionFromCtx(context).catch(() => null)
	if (!session) {
		return
	}
	const path = context.path
	const needsRecent =
		path === "/password/set" ||
		(TWO_FACTOR_SENSITIVE_PATHS.has(path) &&
			!userHasCredentialPassword(session.user.id))
	if (!needsRecent) {
		return
	}
	const createdAt = new Date(session.session.createdAt).getTime()
	if (Date.now() - createdAt > RECENT_LOGIN_MAX_MS) {
		throw new APIError("FORBIDDEN", {
			code: "RECENT_LOGIN_REQUIRED",
			message:
				"For your security, log in again with an email link first.",
		})
	}
}

/**
 * Turns a just-completed magic-link sign-in into a pending two-factor challenge when the account has
 * 2FA on: the session is removed again, the same signed `two_factor` cookie the password flow uses is
 * set, and the browser is sent to the login page, which shows the code step.
 */
async function requireTwoFactorAfterMagicLink(context: AuthMiddlewareContext) {
	const created = context.context.newSession
	if (!created?.user.twoFactorEnabled) {
		return
	}
	const authContext = context.context
	context.setCookie(authContext.authCookies.sessionToken.name, "", {
		...authContext.authCookies.sessionToken.attributes,
		maxAge: 0,
	})
	context.setCookie(authContext.authCookies.sessionData.name, "", {
		...authContext.authCookies.sessionData.attributes,
		maxAge: 0,
	})
	await authContext.internalAdapter.deleteSession(created.session.token)
	authContext.setNewSession(null)
	const cookie = authContext.createAuthCookie("two_factor", {
		maxAge: TWO_FACTOR_PENDING_SECONDS,
	})
	const identifier = `2fa-${crypto.randomUUID().replaceAll("-", "")}`
	const expiresAt = new Date(Date.now() + TWO_FACTOR_PENDING_SECONDS * 1000)
	await authContext.internalAdapter.createVerificationValue({
		value: created.user.id,
		identifier,
		expiresAt,
	})
	await authContext.internalAdapter.createVerificationValue({
		value: "0",
		identifier: `2fa-attempts-${identifier}`,
		expiresAt,
	})
	await context.setSignedCookie(
		cookie.name,
		identifier,
		authContext.secret,
		cookie.attributes
	)
	audit({
		kind: "auth",
		ip: clientIp(context),
		actorId: created.user.id,
		actorEmail: created.user.email,
		action: "Login link accepted",
		detail: "waiting for a two-factor code",
	})
	throw context.redirect("/login?twoFactor=1")
}

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
		// Without this, anyone could register a password on an address that isn't theirs and keep it
		// after the owner verifies. Read on every request so switching SMTP on or off takes effect at once;
		// with no way to send email, verification can't be asked for.
		get requireEmailVerification() {
			return isSmtpConfigured()
		},
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
			if (context.path === "/delete-user") {
				const deleteBody = context.body as
					| { password?: unknown; token?: unknown }
					| undefined
				const deleteSession = await getSessionFromCtx(context).catch(
					() => null
				)
				if (deleteSession && !deleteBody?.token) {
					if (
						userHasCredentialPassword(deleteSession.user.id) &&
						!deleteBody?.password
					) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Enter your password to delete your account.",
						})
					}
					if (!userHasCredentialPassword(deleteSession.user.id)) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Request a confirmation link by email first.",
							code: "DELETE_LINK_REQUIRED",
						})
					}
				}
			}
			if (context.path === "/delete-user/callback") {
				const deletionToken = (
					context.query as { token?: unknown } | undefined
				)?.token
				const deletionSession = await getSessionFromCtx(context).catch(
					() => null
				)
				if (typeof deletionToken === "string" && deletionSession) {
					deletionActors.set(deletionToken, {
						id: deletionSession.user.id,
						email: deletionSession.user.email,
					})
				}
			}
			await requireRecentLogin(context)
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
			if (context.path === "/send-verification-email") {
				if (!isSmtpConfigured()) {
					throw new APIError("BAD_REQUEST", {
						message:
							"Email verification is not available on this server.",
					})
				}
				const verifySession = await getSessionFromCtx(context).catch(
					() => null
				)
				const bodyEmail = (
					context.body as { email?: unknown } | undefined
				)?.email
				const verifyEmail =
					typeof bodyEmail === "string"
						? bodyEmail
						: verifySession?.user.email
				if (
					typeof verifyEmail === "string" &&
					emailResendCooldownBlocked(
						"verification-email",
						verifyEmail
					)
				) {
					// Only the signed-in owner is told about the cooldown; anyone else gets the usual answer, so
					// the cooldown can't be used to probe addresses or to make the real owner's requests fail.
					if (
						verifySession?.user.email.toLowerCase() !==
						verifyEmail.trim().toLowerCase()
					) {
						return context.json({ status: true })
					}
					const seconds = emailResendCooldownRemainingSeconds(
						"verification-email",
						verifyEmail
					)
					throw new APIError("TOO_MANY_REQUESTS", {
						code: "VERIFICATION_EMAIL_COOLDOWN",
						message: `Please wait ${seconds} seconds before requesting another verification email.`,
					})
				}
			}
			if (
				context.path === "/update-user" ||
				context.path === "/sign-up/email" ||
				context.path === "/sign-in/magic-link" ||
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
			if (context.path === "/sign-up/email" && isSmtpConfigured()) {
				throw new APIError("FORBIDDEN", {
					code: "PASSWORD_SIGNUP_DISABLED",
					message:
						"Create your account with an email sign-in link instead.",
				})
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
			if (context.path === "/api-key/create") {
				if (isDemoUserId(session.user.id)) {
					throw new APIError("FORBIDDEN", {
						message: "The demo account can’t create API keys.",
					})
				}
				if (countApiKeys(session.user.id) >= MAX_API_KEYS_PER_USER) {
					throw new APIError("BAD_REQUEST", {
						message: `You can have up to ${MAX_API_KEYS_PER_USER} API keys. Delete one first.`,
					})
				}
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
			// Clicking a login link signs in without the 2FA plugin's sign-in hook ever running, so accounts
			// with two-factor on are held at the code step here, exactly as a password login would be.
			if (context.path === "/magic-link/verify") {
				const bannedRedirect = redirectBannedMagicLinkVerify(
					context,
					returned
				)
				if (bannedRedirect) {
					return bannedRedirect
				}
				await requireTwoFactorAfterMagicLink(context)
				auditMagicLinkVerify(context, returned)
				return
			}
			if (returned instanceof Response) {
				return
			}
			logAuthEvent(context, returned)
			if (context.path === "/delete-user/callback") {
				const deletionToken = (
					context.query as { token?: unknown } | undefined
				)?.token
				if (typeof deletionToken === "string") {
					deletionActors.delete(deletionToken)
				}
			}
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
	// Verifying an email proves it, so login links can then be used without Better Auth stripping the password.
	emailVerification: {
		sendOnSignUp: true,
		// A password login that is refused for an unverified address sends a fresh link.
		sendOnSignIn: true,
		autoSignInAfterVerification: false,
		afterEmailVerification: async (verified) => {
			await discardPasswordSetBeforeEmailProof(verified.id)
		},
		sendVerificationEmail: async ({
			user: target,
			url,
		}: {
			user: { email: string }
			url: string
		}) => {
			// Sign-in and sign-up both send these; the cooldown stops either from being used to flood an inbox.
			if (
				!isSmtpConfigured() ||
				emailResendCooldownBlocked("verification-email", target.email)
			) {
				return
			}
			recordEmailResendSent("verification-email", target.email)
			const link = new URL(url)
			link.searchParams.set("callbackURL", "/email-verified")
			const verifyUrl = link.toString()
			const { text, html } = verifyEmailMailContent(verifyUrl)
			await sendMail({
				to: target.email,
				subject: "Verify your Ledger email",
				text,
				html,
			})
		},
	},
	user: {
		// Settings → Delete account. Every app table references user(id) ON DELETE CASCADE, so removing
		// the user also removes their connections, accounts, transactions, rules and subscriptions.
		deleteUser: {
			enabled: true,
		},
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
			hideAiSuggestions: {
				type: "boolean",
				defaultValue: false,
				input: true,
				required: false,
			},
			// Settings → Preferences: "off" or "monthly" spending digest email (opt-in).
			spendingDigest: {
				type: "string",
				defaultValue: "off",
				input: true,
				required: false,
			},
			// Month ("YYYY-MM") of the last digest sent; server-managed so a month is never emailed twice.
			spendingDigestLastPeriod: {
				type: "string",
				input: false,
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
				// The very first account runs the instance; accounts an admin adds are vouched for by that admin.
				before: async (user, context) => {
					if (
						context?.path === "/magic-link/verify" &&
						hasRealUsers() &&
						!registrationOpen()
					) {
						throw new APIError("BAD_REQUEST", {
							message: "Registration is closed.",
							code: "REGISTRATION_CLOSED",
						})
					}
					if (context?.path === "/admin/create-user") {
						return { data: { ...user, emailVerified: true } }
					}
					if (hasRealUsers()) {
						return
					}
					return {
						data: { ...user, role: "admin", emailVerified: true },
					}
				},
				after: async (user, context) => {
					if (context?.path === "/magic-link/verify") {
						markMagicLinkSignUp(user.id)
					}
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
		passwordPlugin(),
		magicLink({
			expiresIn: 600,
			storeToken: "hashed",
			sendMagicLink: async ({ email, token }) => {
				recordEmailResendSent(MAGIC_LINK_COOLDOWN_KIND, email)
				const linkUrl = `${env.APP_URL}/login/link?token=${encodeURIComponent(token)}`
				const { text, html } = magicLinkMailContent(linkUrl)
				void sendMail({
					to: email,
					subject: "Your Ledger login link",
					text,
					html,
				}).catch((error) => {
					console.error("[mail] magic link failed", error)
				})
			},
		}),
		// Authenticator-app (TOTP) two-factor with one-time backup codes.
		// Accounts without a password (login-link users) can turn it on too; the before hook asks them for a recent login instead.
		twoFactor({ issuer: "Ledger", allowPasswordless: true }),
		// Settings → Admin: list, create, ban and remove users.
		admin({
			defaultRole: "user",
			adminRoles: ["admin"],
			bannedUserMessage:
				"Your access to this Ledger has been turned off. Ask its admin to restore it.",
		}),
		// Settings → API keys: personal keys for the read-only REST API (/api/v1). Keys are stored hashed and
		// never act as sessions (enableSessionForAPIKeys stays off), so a key cannot reach any Better Auth endpoint.
		apiKey({
			defaultPrefix: API_KEY_PREFIX,
			requireName: true,
			maximumNameLength: API_KEY_NAME_MAX,
			enableMetadata: false,
			enableSessionForAPIKeys: false,
			keyExpiration: { maxExpiresIn: API_KEY_MAX_EXPIRY_DAYS },
			rateLimit: {
				enabled: true,
				timeWindow: API_KEY_RATE_LIMIT_WINDOW_MS,
				maxRequests: API_KEY_RATE_LIMIT_MAX,
			},
		}),
		// Invisible Cloudflare Turnstile on sign-in and sign-up, when both keys are configured.
		...(turnstileSecretKey
			? [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: turnstileSecretKey,
						endpoints: [
							"/sign-in/email",
							"/sign-up/email",
							"/sign-in/magic-link",
						],
					}),
				]
			: []),
		// After the captcha plugin, so its answers are only given to callers who passed the captcha.
		magicLinkGuard({ registrationOpen }),
	],
	// Throttle password guessing (in-memory; this is a single-process app). On by default only in production.
	rateLimit: {
		enabled: true,
		window: 60,
		max: 100,
		customRules: {
			"/sign-in/email": { window: 60, max: 5 },
			"/sign-in/magic-link": { window: 60, max: 3 },
			"/sign-up/email": { window: 60, max: 3 },
			"/two-factor/verify-totp": { window: 60, max: 5 },
			"/two-factor/verify-backup-code": { window: 60, max: 5 },
			"/delete-user": { window: 60, max: 3 },
			"/delete-user/request-link": { window: 60, max: 3 },
			"/send-verification-email": { window: 60, max: 3 },
			"/change-password": { window: 60, max: 5 },
			"/password/set": { window: 60, max: 5 },
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
