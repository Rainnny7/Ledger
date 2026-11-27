import assert from "node:assert/strict"
import { beforeEach, before, test } from "node:test"
import { spyOn } from "bun:test"
import { createHash } from "node:crypto"
import { symmetricEncrypt } from "better-auth/crypto"
import { eq } from "drizzle-orm"
import { auth } from "../../src/auth/index.ts"
import { env } from "../../src/config/env.ts"
import { db, runMigrations, setSetting } from "../../src/db/connection.ts"
import {
	account,
	adminAudit,
	session,
	twoFactor,
	user,
	verification,
} from "../../src/db/schema/index.ts"
import * as smtp from "../../src/mail/smtp.ts"
import { saveSmtpConfig } from "../../src/mail/smtp.ts"
import { createEmailVerificationToken } from "better-auth/api"

function enableTestSmtp() {
	saveSmtpConfig({
		host: "smtp.example.com",
		port: 587,
		secure: false,
		username: "",
		password: "test-smtp-password",
		fromAddress: "noreply@example.com",
		fromName: "Ledger Test",
	})
}

function hashMagicToken(token: string) {
	return createHash("sha256").update(token, "utf8").digest("base64url")
}

async function insertMagicToken(
	id: string,
	token: string,
	email: string,
	name?: string
) {
	const stored = hashMagicToken(token)
	db.insert(verification)
		.values({
			id,
			identifier: `magic-link:${stored}`,
			value: JSON.stringify({
				type: "magic-link",
				email,
				name,
			}),
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		})
		.run()
}

const origin = "http://localhost:3000"
const now = new Date().toISOString()
/** Every message the server tried to send; nothing leaves the test process, so no SMTP or DNS lookup happens. */
let sentMail: { to: string; subject: string; text: string; html: string }[] = []

beforeEach(() => {
	sentMail = []
})

before(async () => {
	spyOn(smtp, "sendMail").mockImplementation(async (message) => {
		sentMail.push({
			to: message.to,
			subject: message.subject,
			text: message.text,
			html: message.html ?? "",
		})
	})
	runMigrations()
	const encryptedBackups = await symmetricEncrypt({
		data: JSON.stringify(["ABCDE-12345"]),
		key: env.APP_SECRET,
	})
	db.insert(user)
		.values({
			id: "2fa-user",
			name: "Two Factor",
			email: "2fa@example.com",
			emailVerified: true,
			twoFactorEnabled: true,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing()
		.run()
	db.insert(twoFactor)
		.values({
			id: "2fa-secret",
			secret: "unused",
			backupCodes: encryptedBackups,
			userId: "2fa-user",
			verified: true,
		})
		.onConflictDoNothing()
		.run()
})

function magicLink(email: string, name?: string, ip = "10.0.0.3") {
	return auth.handler(
		new Request(`${origin}/api/auth/sign-in/magic-link`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin,
				"x-ledger-client-ip": ip,
			},
			body: JSON.stringify({
				email,
				name,
				callbackURL: "/",
				errorCallbackURL: "/login",
			}),
		})
	)
}

async function bodyOf(response: Response) {
	return (await response.json()) as { message?: string; code?: string }
}

test("magic-link request is rejected when SMTP is not configured", async () => {
	setSetting("smtp_config", "")
	const response = await magicLink("nobody@example.com")
	assert.equal(response.status, 400)
	assert.match((await bodyOf(response)).message ?? "", /not available/i)
})

test("closed registration for unknown email still returns success without sending", async () => {
	enableTestSmtp()
	setSetting("registration_open", "false")
	const response = await magicLink("brand-new@example.com")
	assert.equal(response.status, 200)
	assert.deepEqual(await response.json(), { status: true })
	assert.equal(sentMail.length, 0)
	assert.equal(
		db
			.select()
			.from(verification)
			.all()
			.some((row) => row.value.includes("brand-new@example.com")),
		false
	)
})

test("a login link for a two-factor account ends at the code step, not a session", async () => {
	enableTestSmtp()
	const token = "test-magic-token-2fa"
	await insertMagicToken("magic-2fa-verification", token, "2fa@example.com")
	const response = await auth.handler(
		new Request(
			`${origin}/api/auth/magic-link/verify?token=${token}&callbackURL=/`,
			{
				headers: { "x-ledger-client-ip": "10.0.0.4" },
				redirect: "manual",
			}
		)
	)
	assert.equal(response.status, 302)
	assert.equal(response.headers.get("location"), "/login?twoFactor=1")
	const cookies = response.headers.getSetCookie()
	assert.ok(cookies.some((cookie) => cookie.includes("two_factor=")))
	const sessionCookies = cookies.filter((cookie) =>
		cookie.includes("session_token=")
	)
	assert.match(sessionCookies.at(-1) ?? "", /session_token=;/)
	const sessions = db
		.select()
		.from(session)
		.where(eq(session.userId, "2fa-user"))
		.all()
	assert.equal(sessions.length, 0)
})

test("magic link verify plus backup code issues a session", async () => {
	enableTestSmtp()
	const token = "test-magic-token-2fa-backup"
	await insertMagicToken("magic-2fa-backup", token, "2fa@example.com")
	const verifyResponse = await auth.handler(
		new Request(
			`${origin}/api/auth/magic-link/verify?token=${token}&callbackURL=/`,
			{
				headers: {
					"x-ledger-client-ip": "10.0.0.44",
					origin,
				},
				redirect: "manual",
			}
		)
	)
	assert.equal(verifyResponse.status, 302)
	const cookieHeader = verifyResponse.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ")
	const backupResponse = await auth.handler(
		new Request(`${origin}/api/auth/two-factor/verify-backup-code`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin,
				cookie: cookieHeader,
				"x-ledger-client-ip": "10.0.0.45",
			},
			body: JSON.stringify({ code: "ABCDE-12345" }),
		})
	)
	assert.equal(backupResponse.status, 200)
	const live = db
		.select()
		.from(session)
		.where(eq(session.userId, "2fa-user"))
		.all()
	assert.ok(live.length > 0)
})

test("unverified password user can request a login link", async () => {
	enableTestSmtp()
	const email = "unverified-password@example.com"
	db.insert(user)
		.values({
			id: "unverified-password",
			name: "Unverified",
			email,
			emailVerified: false,
			createdAt: now,
			updatedAt: now,
		})
		.run()
	db.insert(account)
		.values({
			id: "unverified-password-cred",
			userId: "unverified-password",
			providerId: "credential",
			accountId: "unverified-password",
			password: "hash",
			createdAt: now,
			updatedAt: now,
		})
		.run()
	const response = await magicLink(email, undefined, "10.0.0.20")
	assert.equal(response.status, 200)
	assert.equal(sentMail.length, 1)
})

test("registration closed between request and verify does not create a user", async () => {
	enableTestSmtp()
	setSetting("registration_open", "true")
	const email = "closed-after-request@example.com"
	const token = "closed-after-request-token"
	await insertMagicToken("magic-closed-verify", token, email, "Late")
	setSetting("registration_open", "false")
	const response = await auth.handler(
		new Request(
			`${origin}/api/auth/magic-link/verify?token=${token}&callbackURL=/&errorCallbackURL=/login`,
			{
				headers: { "x-ledger-client-ip": "10.0.0.46", origin },
				redirect: "manual",
			}
		)
	)
	assert.equal(response.status, 302)
	assert.ok(response.headers.get("location")?.includes("error="))
	assert.equal(
		db.select().from(user).where(eq(user.email, email)).get(),
		undefined
	)
})

test("a login link for a new address creates the user and audits sign-up", async () => {
	enableTestSmtp()
	setSetting("registration_open", "true")
	const email = "magic-signup@example.com"
	const token = "test-magic-token-signup"
	await insertMagicToken(
		"magic-signup-verification",
		token,
		email,
		"Link Signup"
	)
	const response = await auth.handler(
		new Request(
			`${origin}/api/auth/magic-link/verify?token=${token}&callbackURL=/`,
			{
				headers: { "x-ledger-client-ip": "10.0.0.5" },
				redirect: "manual",
			}
		)
	)
	assert.equal(response.status, 302)
	const created = db.select().from(user).where(eq(user.email, email)).get()
	assert.ok(created)
	const signedUp = db
		.select()
		.from(adminAudit)
		.where(eq(adminAudit.action, "Signed up"))
		.all()
	assert.ok(
		signedUp.some(
			(row) =>
				row.actorEmail === email && row.detail === "with an email link"
		)
	)
	const cookie = response.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ")
	const strong = "Correct-Horse-Battery-9"
	const weak = "short"
	const setPassword = (password: string, sessionCookie: string) =>
		auth.handler(
			new Request(`${origin}/api/auth/password/set`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin,
					cookie: sessionCookie,
					"x-ledger-client-ip": "10.0.0.6",
				},
				body: JSON.stringify({ newPassword: password }),
			})
		)
	const firstSet = await setPassword(strong, cookie)
	assert.equal(firstSet.status, 200)
	const refreshedCookie = firstSet.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ")
	const weakResponse = await setPassword(weak, refreshedCookie || cookie)
	assert.equal(weakResponse.status, 400)
	const weakBody = (await weakResponse.json()) as { code?: string }
	assert.equal(weakBody.code, "WEAK_PASSWORD")
	const again = await setPassword(strong, refreshedCookie || cookie)
	assert.equal(again.status, 400)
	const againBody = (await again.json()) as { code?: string }
	assert.equal(againBody.code, "PASSWORD_ALREADY_SET")
})

test("stale session cannot set a password", async () => {
	enableTestSmtp()
	const email = "stale-session@example.com"
	const token = "stale-session-token"
	await insertMagicToken("magic-stale", token, email, "Stale")
	const verifyResponse = await auth.handler(
		new Request(
			`${origin}/api/auth/magic-link/verify?token=${token}&callbackURL=/`,
			{
				headers: { origin, "x-ledger-client-ip": "10.0.0.7" },
				redirect: "manual",
			}
		)
	)
	const cookie = verifyResponse.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ")
	const row = db.select().from(user).where(eq(user.email, email)).get()
	assert.ok(row)
	db.update(session)
		.set({
			createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
		})
		.where(eq(session.userId, row.id))
		.run()
	const setResponse = await auth.handler(
		new Request(`${origin}/api/auth/password/set`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin,
				cookie,
				"x-ledger-client-ip": "10.0.0.8",
			},
			body: JSON.stringify({ newPassword: "Correct-Horse-Battery-9" }),
		})
	)
	assert.equal(setResponse.status, 403)
	const body = (await setResponse.json()) as { code?: string }
	assert.equal(body.code, "RECENT_LOGIN_REQUIRED")
})

test("password user delete-user with password deletes immediately", async () => {
	enableTestSmtp()
	const email = "delete-me@example.com"
	const signupToken = "delete-signup-token"
	await insertMagicToken("magic-delete-user", signupToken, email, "Delete Me")
	const verifyResponse = await auth.handler(
		new Request(
			`${origin}/api/auth/magic-link/verify?token=${signupToken}&callbackURL=/`,
			{
				headers: { origin, "x-ledger-client-ip": "10.0.0.9" },
				redirect: "manual",
			}
		)
	)
	const cookie = verifyResponse.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ")
	const setResponse = await auth.handler(
		new Request(`${origin}/api/auth/password/set`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin,
				cookie,
				"x-ledger-client-ip": "10.0.0.10",
			},
			body: JSON.stringify({ newPassword: "Correct-Horse-Battery-9" }),
		})
	)
	const sessionCookie = setResponse.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ")
	const row = db.select().from(user).where(eq(user.email, email)).get()
	assert.ok(row)
	const deleteResponse = await auth.handler(
		new Request(`${origin}/api/auth/delete-user`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin,
				cookie: sessionCookie || cookie,
				"x-ledger-client-ip": "10.0.0.11",
			},
			body: JSON.stringify({ password: "Correct-Horse-Battery-9" }),
		})
	)
	assert.equal(deleteResponse.status, 200)
	assert.equal(
		db.select().from(user).where(eq(user.email, email)).get(),
		undefined
	)
})

test("email verification is configured at the top level, so Settings can send a verification email", () => {
	assert.equal(
		typeof auth.options.emailVerification?.sendVerificationEmail,
		"function"
	)
})

test("sendVerificationEmail rewrites callbackURL to /email-verified", async () => {
	enableTestSmtp()
	const send = auth.options.emailVerification?.sendVerificationEmail
	assert.equal(typeof send, "function")
	await send!({
		user: { email: "callback-check@example.com" },
		url: `${origin}/api/auth/verify-email?token=test-token&callbackURL=${encodeURIComponent("/")}`,
	})
	assert.equal(sentMail.length, 1)
	assert.match(sentMail[0].text, /email-verified/)
	assert.match(sentMail[0].html, /email-verified/)
})

test("a second send-verification-email within 60s returns 429", async () => {
	enableTestSmtp()
	setSetting("registration_open", "true")
	const email = "verify-resend@example.com"
	const token = "verify-resend-session"
	await insertMagicToken("verify-resend-magic", token, email, "Verify")
	const verifyResponse = await auth.handler(
		new Request(
			`${origin}/api/auth/magic-link/verify?token=${token}&callbackURL=/`,
			{
				headers: { origin, "x-ledger-client-ip": "10.0.0.12" },
				redirect: "manual",
			}
		)
	)
	const cookie = verifyResponse.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ")
	const row = db.select().from(user).where(eq(user.email, email)).get()
	assert.ok(row)
	db.update(user)
		.set({ emailVerified: false })
		.where(eq(user.id, row.id))
		.run()
	const body = JSON.stringify({
		email,
		callbackURL: "/email-verified",
	})
	const headers = {
		"content-type": "application/json",
		origin,
		cookie,
		"x-ledger-client-ip": "10.0.0.13",
	}
	const first = await auth.handler(
		new Request(`${origin}/api/auth/send-verification-email`, {
			method: "POST",
			headers,
			body,
		})
	)
	assert.equal(first.status, 200)
	const second = await auth.handler(
		new Request(`${origin}/api/auth/send-verification-email`, {
			method: "POST",
			headers,
			body,
		})
	)
	assert.equal(second.status, 429)
	const denied = (await second.json()) as { code?: string }
	assert.equal(denied.code, "VERIFICATION_EMAIL_COOLDOWN")
})

/** Signs a fresh address in with a login link and returns the session cookie and the new user's row. */
async function signUpWithLink(email: string, token: string, ip: string) {
	setSetting("registration_open", "true")
	await insertMagicToken(`magic-${token}`, token, email, "Link User")
	const response = await auth.handler(
		new Request(
			`${origin}/api/auth/magic-link/verify?token=${token}&callbackURL=/`,
			{
				headers: { origin, "x-ledger-client-ip": ip },
				redirect: "manual",
			}
		)
	)
	const cookie = response.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ")
	const row = db.select().from(user).where(eq(user.email, email)).get()
	assert.ok(row)
	return { cookie, row }
}

function post(path: string, body: unknown, headers: Record<string, string>) {
	return auth.handler(
		new Request(`${origin}/api/auth${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", origin, ...headers },
			body: JSON.stringify(body),
		})
	)
}

function get(path: string, ip: string, cookie?: string) {
	return auth.handler(
		new Request(`${origin}/api/auth${path}`, {
			headers: {
				origin,
				"x-ledger-client-ip": ip,
				...(cookie ? { cookie } : {}),
			},
			redirect: "manual",
		})
	)
}

test("a banned user's login link goes back to the login page and is audited", async () => {
	enableTestSmtp()
	const email = "banned-link@example.com"
	db.insert(user)
		.values({
			id: "banned-link-user",
			name: "Banned",
			email,
			emailVerified: true,
			banned: true,
			banReason: "test",
			createdAt: now,
			updatedAt: now,
		})
		.run()
	await insertMagicToken("magic-banned", "banned-link-token", email)
	const response = await get(
		"/magic-link/verify?token=banned-link-token&callbackURL=/",
		"10.0.0.21"
	)
	assert.equal(response.status, 302)
	assert.equal(response.headers.get("location"), "/login?error=banned")
	assert.ok(
		db
			.select()
			.from(adminAudit)
			.all()
			.some(
				(row) =>
					row.action.endsWith("(failed)") &&
					row.detail === "access turned off"
			)
	)
})

test("a login-link request inside the cooldown looks the same but sends nothing", async () => {
	enableTestSmtp()
	const email = "cooldown-link@example.com"
	await signUpWithLink(email, "cooldown-signup-token", "10.0.0.23")
	sentMail = []
	const first = await magicLink(email, undefined, "10.0.0.24")
	assert.equal(first.status, 200)
	assert.deepEqual(await first.json(), { status: true })
	assert.equal(sentMail.length, 1)
	const second = await magicLink(email, undefined, "10.0.0.25")
	assert.equal(second.status, 200)
	assert.deepEqual(await second.json(), { status: true })
	assert.equal(sentMail.length, 1)
})

test("a verify-email link that works is audited even though it answers with a redirect", async () => {
	enableTestSmtp()
	const email = "verify-audit@example.com"
	db.insert(user)
		.values({
			id: "verify-audit-user",
			name: "Verify Audit",
			email,
			emailVerified: false,
			createdAt: now,
			updatedAt: now,
		})
		.run()
	const token = await createEmailVerificationToken(
		env.APP_SECRET,
		email,
		undefined,
		3600
	)
	const response = await get(
		`/verify-email?token=${token}&callbackURL=/email-verified`,
		"10.0.0.26"
	)
	assert.equal(response.status, 302)
	assert.equal(
		db.select().from(user).where(eq(user.email, email)).get()
			?.emailVerified,
		true
	)
	assert.ok(
		db
			.select()
			.from(adminAudit)
			.all()
			.some(
				(row) =>
					row.actorEmail === email && !row.action.endsWith("(failed)")
			)
	)
})

test("a verify-email link that fails is audited as a failure with its code", async () => {
	enableTestSmtp()
	const response = await get(
		"/verify-email?token=not-a-token&callbackURL=/email-verified",
		"10.0.0.27"
	)
	assert.match(response.headers.get("location") ?? "", /error=/)
	assert.ok(
		db
			.select()
			.from(adminAudit)
			.all()
			.some(
				(row) =>
					row.action.endsWith("(failed)") &&
					row.detail === "INVALID_TOKEN"
			)
	)
})

test("an emailed delete link deletes the account and is audited under the user who clicked it", async () => {
	enableTestSmtp()
	const email = "delete-link@example.com"
	const { cookie, row } = await signUpWithLink(
		email,
		"delete-link-signup",
		"10.0.0.28"
	)
	const stamp = new Date().toISOString()
	db.insert(verification)
		.values({
			id: "delete-link-row",
			identifier: "delete-account-deletetoken123",
			value: row.id,
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			createdAt: stamp,
			updatedAt: stamp,
		})
		.run()
	const response = await get(
		"/delete-user/callback?token=deletetoken123&callbackURL=/login",
		"10.0.0.29",
		cookie
	)
	assert.equal(response.status, 302)
	assert.equal(
		db.select().from(user).where(eq(user.email, email)).get(),
		undefined
	)
	assert.ok(
		db
			.select()
			.from(adminAudit)
			.all()
			.some(
				(entry) =>
					entry.actorEmail === email &&
					entry.action.toLowerCase().includes("delet") &&
					!entry.action.endsWith("(failed)")
			)
	)
})

test("setting a password removes any emailed delete links for the account", async () => {
	enableTestSmtp()
	const { cookie, row } = await signUpWithLink(
		"set-clears-delete@example.com",
		"set-clears-signup",
		"10.0.0.30"
	)
	const stamp = new Date().toISOString()
	db.insert(verification)
		.values({
			id: "outstanding-delete",
			identifier: "delete-account-outstanding",
			value: row.id,
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			createdAt: stamp,
			updatedAt: stamp,
		})
		.run()
	const response = await post(
		"/password/set",
		{ newPassword: "Correct-Horse-Battery-9" },
		{ cookie, "x-ledger-client-ip": "10.0.0.31" }
	)
	assert.equal(response.status, 200)
	assert.equal(
		db
			.select()
			.from(verification)
			.where(eq(verification.id, "outstanding-delete"))
			.get(),
		undefined
	)
})

test("two simultaneous password-set requests leave a single credential account", async () => {
	enableTestSmtp()
	const { cookie, row } = await signUpWithLink(
		"set-race@example.com",
		"set-race-signup",
		"10.0.0.32"
	)
	const responses = await Promise.all(
		["10.0.0.33", "10.0.0.34"].map((ip) =>
			post(
				"/password/set",
				{ newPassword: "Correct-Horse-Battery-9" },
				{ cookie, "x-ledger-client-ip": ip }
			)
		)
	)
	assert.equal(
		responses.filter((response) => response.status === 200).length,
		1
	)
	const credentials = db
		.select()
		.from(account)
		.where(eq(account.userId, row.id))
		.all()
		.filter((entry) => entry.providerId === "credential")
	assert.equal(credentials.length, 1)
})

test("a login-link user can turn on two-factor without a password after a recent login", async () => {
	enableTestSmtp()
	const { cookie, row } = await signUpWithLink(
		"passwordless-2fa@example.com",
		"passwordless-2fa-signup",
		"10.0.0.35"
	)
	const fresh = await post(
		"/two-factor/enable",
		{},
		{ cookie, "x-ledger-client-ip": "10.0.0.36" }
	)
	assert.equal(fresh.status, 200)
	db.update(session)
		.set({ createdAt: new Date(Date.now() - 20 * 60_000).toISOString() })
		.where(eq(session.userId, row.id))
		.run()
	const stale = await post(
		"/two-factor/enable",
		{},
		{ cookie, "x-ledger-client-ip": "10.0.0.37" }
	)
	assert.equal(stale.status, 403)
	assert.equal((await bodyOf(stale)).code, "RECENT_LOGIN_REQUIRED")
})

test("with SMTP configured password sign-up is refused", async () => {
	enableTestSmtp()
	setSetting("registration_open", "true")
	const signUp = await post(
		"/sign-up/email",
		{
			name: "Blocked",
			email: "needs-verification@example.com",
			password: "Correct-Horse-Battery-9",
		},
		{ "x-ledger-client-ip": "10.0.0.38" }
	)
	assert.equal(signUp.status, 403)
	assert.equal((await bodyOf(signUp)).code, "PASSWORD_SIGNUP_DISABLED")
	assert.equal(sentMail.length, 0)
})

test("after verify-email, a pre-verification password is removed", async () => {
	setSetting("smtp_config", "")
	setSetting("registration_open", "true")
	const email = "stripped-on-verify@example.com"
	const password = "Correct-Horse-Battery-9"
	const signUp = await post(
		"/sign-up/email",
		{ name: "Victim", email, password },
		{ "x-ledger-client-ip": "10.0.0.41" }
	)
	assert.equal(signUp.status, 200)
	const userId = (
		(await signUp.json()) as { user: { id: string } }
	).user.id
	enableTestSmtp()
	const token = await createEmailVerificationToken(
		env.APP_SECRET,
		email,
		undefined,
		3600
	)
	const verify = await get(
		`/verify-email?token=${token}&callbackURL=/email-verified`,
		"10.0.0.42"
	)
	assert.equal(verify.status, 302)
	assert.equal(
		db.select().from(account).where(eq(account.userId, userId)).get(),
		undefined
	)
	const signIn = await post(
		"/sign-in/email",
		{ email, password },
		{ "x-ledger-client-ip": "10.0.0.43" }
	)
	assert.equal(signIn.status, 401)
})

test("without SMTP a password sign-up logs straight in", async () => {
	setSetting("smtp_config", "")
	setSetting("registration_open", "true")
	const response = await post(
		"/sign-up/email",
		{
			name: "No Mail",
			email: "no-smtp@example.com",
			password: "Correct-Horse-Battery-9",
		},
		{ "x-ledger-client-ip": "10.0.0.40" }
	)
	assert.equal(response.status, 200)
	assert.ok(((await response.json()) as { token: unknown }).token)
	assert.equal(sentMail.length, 0)
})
