/**
 * In-memory login sessions. A bank login is a multi-request conversation
 * (credentials → choose 2FA method → enter code), so the live browser is kept
 * here between requests and torn down when done or abandoned.
 */
import { randomUUID } from "node:crypto"
import { decrypt, encrypt } from "../security/crypto.ts"
import { and, eq } from "drizzle-orm"
import { db } from "../db/connection.ts"
import { bankConnection } from "../db/schema/index.ts"
import { PaypalClient } from "./paypal/client.ts"
import { historyPlan, saveScrape } from "./store.ts"
import { bankErrorForClient } from "./errors.ts"
import { withBrowserTimeout, withConnectionLock } from "./session-lock.ts"
import { TdScraper } from "./td/scraper.ts"
import type { BankClient, LoginStep } from "./types.ts"

const SESSION_TTL_MS = 10 * 60 * 1000

/** Everything Ledger can connect to. Add a provider here and in the client's connect dialog. */
export const PROVIDERS = {
	td: {
		label: "TD EasyWeb",
		/** What error messages call the place the user signs in. */
		site: "EasyWeb",
		secretName: "EasyWeb password",
		/** API keys have to be kept to sync again; bank passwords are only kept when asked. */
		alwaysRemember: false,
		create: (): BankClient => new TdScraper(),
	},
	paypal: {
		label: "PayPal",
		site: "PayPal",
		secretName: "PayPal Secret",
		alwaysRemember: true,
		create: (): BankClient => new PaypalClient(),
	},
} as const
/** ProviderId values accepted by validation and routes. */
export type ProviderId = keyof typeof PROVIDERS
/** Public export for routes and tests. */
export const isProvider = (v: string): v is ProviderId =>
	Object.hasOwn(PROVIDERS, v)

/** Shape of SessionView as stored and returned by the API. */
export interface SessionView {
	sessionId: string
	step:
		| LoginStep
		| { type: "syncing"; message: string }
		| { type: "done"; connectionId: string }
}

interface LoginSession {
	id: string
	userId: string
	provider: ProviderId
	connectionId: string | null
	username: string
	password: string
	remember: boolean
	/** Re-read the full history instead of only what's new since the last sync. */
	full: boolean
	scraper: BankClient
	step: SessionView["step"]
	busy: boolean
	timer: NodeJS.Timeout
}

const sessions = new Map<string, LoginSession>()

/** Records why the last sync of a connection failed, for the dashboard to show. */
function recordConnectionError(connectionId: string, message: string) {
	db.update(bankConnection)
		.set({ lastError: message })
		.where(eq(bankConnection.id, connectionId))
		.run()
}

function view(s: LoginSession): SessionView {
	return { sessionId: s.id, step: s.step }
}

async function destroy(s: LoginSession) {
	clearTimeout(s.timer)
	sessions.delete(s.id)
	await s.scraper.close()
}

function touch(s: LoginSession) {
	clearTimeout(s.timer)
	s.timer = setTimeout(() => void destroy(s), SESSION_TTL_MS)
}

/** Look up an in-flight bank login session for a user. */
export function getSession(userId: string, id: string): LoginSession | null {
	const session = sessions.get(id)
	return session && session.userId === userId ? session : null
}

function maskUsername(u: string) {
	const trimmed = u.trim()
	return trimmed.length <= 4
		? "••••"
		: `${"•".repeat(Math.min(8, trimmed.length - 4))}${trimmed.slice(-4)}`
}

/**
 * Advances a session after a login step. On success it scrapes in the
 * background and the client polls for the "done" step.
 */
async function after(s: LoginSession, step: LoginStep): Promise<SessionView> {
	if (step.type === "error") {
		const safe = bankErrorForClient(step.message, "login", {
			password: s.password,
			site: PROVIDERS[s.provider].site,
		})
		s.step = { type: "error", message: safe }
		if (s.connectionId) {
			recordConnectionError(s.connectionId, safe)
		}
		await destroy(s)
		return { sessionId: s.id, step: s.step as LoginStep }
	}
	if (step.type !== "success") {
		s.step = step
		touch(s)
		return view(s)
	}

	s.step = { type: "syncing", message: "Logged in. Reading your accounts…" }
	touch(s)
	void (async () => {
		try {
			const accounts = await withBrowserTimeout(
				() =>
					s.scraper.scrapeAccounts(
						(message) => {
							s.step = { type: "syncing", message }
							touch(s) // a long history read must not hit the idle timeout
						},
						historyPlan(s.connectionId, s.full)
					),
				"Account sync"
			)
			const storage = await s.scraper.storageState()
			const connectionId = saveScrape({
				userId: s.userId,
				connectionId: s.connectionId,
				institution: s.provider,
				label: PROVIDERS[s.provider].label,
				usernameMasked: maskUsername(s.username),
				credentialsEnc: s.remember
					? encrypt({ username: s.username, password: s.password })
					: null,
				browserStateEnc: storage ? encrypt(storage) : null,
				accounts,
			})
			s.connectionId = connectionId
			s.step = { type: "done", connectionId }
		} catch (error) {
			const message = bankErrorForClient(error, "sync", {
				password: s.password,
			})
			s.step = { type: "error", message }
			if (s.connectionId) {
				recordConnectionError(s.connectionId, message)
			}
		} finally {
			// Don't keep the password in memory any longer than needed.
			s.password = ""
			// Keep the finished session around briefly so the client can read the final step.
			await s.scraper.close()
			clearTimeout(s.timer)
			s.timer = setTimeout(() => sessions.delete(s.id), 60_000)
		}
	})()
	return view(s)
}

async function run(
	s: LoginSession,
	fn: () => Promise<LoginStep>
): Promise<SessionView> {
	if (s.busy) {
		return view(s)
	}
	s.busy = true
	try {
		return await after(s, await fn())
	} catch (error) {
		return after(s, {
			type: "error",
			message: bankErrorForClient(error, "connect", {
				password: s.password,
				site: PROVIDERS[s.provider].site,
			}),
		})
	} finally {
		s.busy = false
	}
}

async function startLoginLocked(opts: {
	userId: string
	provider: ProviderId
	connectionId?: string | null
	username?: string
	password?: string
	remember?: boolean
	full?: boolean
}): Promise<SessionView> {
	let { username, password } = opts
	const provider = PROVIDERS[opts.provider]
	let remember = opts.remember ?? false
	let browserState: unknown

	if (opts.connectionId) {
		const row = db
			.select({
				institution: bankConnection.institution,
				credentialsEnc: bankConnection.credentialsEnc,
				browserStateEnc: bankConnection.browserStateEnc,
			})
			.from(bankConnection)
			.where(
				and(
					eq(bankConnection.id, opts.connectionId),
					eq(bankConnection.userId, opts.userId)
				)
			)
			.get()
		if (!row || row.institution !== opts.provider) {
			throw new Error("Connection not found")
		}
		if (row.browserStateEnc) {
			try {
				browserState = decrypt(row.browserStateEnc)
			} catch {
				/* stale key; ignore */
			}
		}
		if ((!username || !password) && row.credentialsEnc) {
			try {
				const creds = decrypt<{ username: string; password: string }>(
					row.credentialsEnc
				)
				username = creds.username
				password = creds.password
				remember = true
			} catch {
				// Encrypted with a different APP_SECRET: ask for the password again.
				throw new Error(
					`Saved login details can no longer be read. Enter your ${provider.secretName} to reconnect.`
				)
			}
		}
	}
	if (!username || !password) {
		throw new Error("Username and password are required")
	}
	if (provider.alwaysRemember) {
		remember = true
	}

	// One bank login per user at a time: each holds a whole browser open.
	for (const other of sessions.values()) {
		if (other.userId === opts.userId && other.step.type !== "done") {
			await destroy(other)
		}
	}

	const scraper = provider.create()
	const session: LoginSession = {
		id: randomUUID(),
		userId: opts.userId,
		provider: opts.provider,
		connectionId: opts.connectionId ?? null,
		username,
		password,
		remember,
		full: opts.full ?? false,
		scraper,
		step: { type: "syncing", message: `Connecting to ${provider.site}…` },
		busy: false,
		timer: setTimeout(() => {}, 0),
	}
	sessions.set(session.id, session)
	touch(session)

	return run(session, async () => {
		await withBrowserTimeout(async () => {
			await scraper.open(browserState)
		}, "Browser launch")
		return withBrowserTimeout(
			() => scraper.login(username, password),
			"Login"
		)
	})
}

/** Begin provider login (TD scrape or PayPal OAuth). */
export async function startLogin(opts: {
	userId: string
	provider: ProviderId
	connectionId?: string | null
	username?: string
	password?: string
	remember?: boolean
	full?: boolean
}): Promise<SessionView> {
	const lockKey = opts.connectionId
		? `conn:${opts.connectionId}`
		: `user:${opts.userId}:${opts.provider}`
	return withConnectionLock(lockKey, () => startLoginLocked(opts))
}

/** Pick an MFA option on an in-progress login session. */
export function chooseMfa(s: LoginSession, optionId: string) {
	return run(s, () => s.scraper.chooseMfa(optionId))
}

/** Submit an MFA code for an in-progress login session. */
export function submitCode(s: LoginSession, code: string) {
	return run(s, () => s.scraper.submitCode(code))
}

/** Non-blocking status poll for login/sync progress. */
export function poll(s: LoginSession) {
	if (s.step.type === "mfa_push") {
		return run(s, () => s.scraper.waitForApproval())
	}
	return Promise.resolve(view(s))
}

/** Tear down an in-progress login session. */
export async function cancel(s: LoginSession) {
	await destroy(s)
}

/** Close every open bank login for a user (their account is being deleted). */
export async function endUserSessions(userId: string) {
	const theirs = [...sessions.values()].filter(
		(session) => session.userId === userId
	)
	for (const session of theirs) {
		await destroy(session)
	}
}

/** Whether the user is in the middle of logging in to a bank themselves. */
export function hasOpenLogin(userId: string) {
	for (const session of sessions.values()) {
		if (
			session.userId === userId &&
			session.step.type !== "done" &&
			session.step.type !== "error"
		) {
			return true
		}
	}
	return false
}

/** BackgroundResult values accepted by validation and routes. */
export type BackgroundResult = "synced" | "needs-sign-in" | "skipped" | "failed"

/**
 * Refreshes one connection with its saved login details, without anyone watching: the
 * scheduled "Refresh bank accounts" task. Reads only what's new since the last sync. When the
 * bank wants a two-factor code it stops there; the user reconnects from the dashboard as usual.
 */
async function syncInBackgroundLocked(
	connectionId: string
): Promise<{ result: BackgroundResult; message?: string }> {
	const row = db
		.select({
			userId: bankConnection.userId,
			institution: bankConnection.institution,
			usernameMasked: bankConnection.usernameMasked,
			creds: bankConnection.credentialsEnc,
			state: bankConnection.browserStateEnc,
		})
		.from(bankConnection)
		.where(eq(bankConnection.id, connectionId))
		.get()
	if (!row?.creds || !isProvider(row.institution)) {
		return { result: "skipped", message: "No saved login details" }
	}
	if (hasOpenLogin(row.userId)) {
		return {
			result: "skipped",
			message: "The user is logging in right now",
		}
	}

	let creds: { username: string; password: string }
	let browserState: unknown
	try {
		creds = decrypt(row.creds)
	} catch {
		return {
			result: "skipped",
			message: "Saved login details can no longer be read",
		}
	}
	try {
		if (row.state) {
			browserState = decrypt(row.state)
		}
	} catch {
		/* stale key; log in without it */
	}

	const provider = PROVIDERS[row.institution]
	const client = provider.create()
	const setError = (raw: unknown) => {
		const message = bankErrorForClient(raw, "sync", {
			password: creds.password,
			site: provider.site,
		})
		recordConnectionError(connectionId, message)
		return message
	}
	try {
		await withBrowserTimeout(
			() => client.open(browserState),
			"Browser launch"
		)
		const step = await withBrowserTimeout(
			() => client.login(creds.username, creds.password),
			"Login"
		)
		if (step.type === "error") {
			const message = bankErrorForClient(step.message, "login", {
				password: creds.password,
				site: provider.site,
			})
			recordConnectionError(connectionId, message)
			return { result: "failed", message }
		}
		// A code or an approval would need the user; leave the connection as it was.
		if (step.type !== "success") {
			return {
				result: "needs-sign-in",
				message: `${provider.site} asked for a two-factor code`,
			}
		}

		const accounts = await withBrowserTimeout(
			() =>
				client.scrapeAccounts(
					() => {},
					historyPlan(connectionId, false)
				),
			"Account sync"
		)
		const storage = await client.storageState()
		saveScrape({
			userId: row.userId,
			connectionId,
			institution: row.institution,
			label: provider.label,
			usernameMasked: row.usernameMasked,
			credentialsEnc: null, // keeps the saved ones
			browserStateEnc: storage ? encrypt(storage) : row.state,
			accounts,
		})
		return { result: "synced" }
	} catch (error) {
		const message = setError(error)
		return { result: "failed", message }
	} finally {
		creds.password = ""
		await client.close().catch(() => {})
	}
}

/** Queue a background sync when credentials are valid. */
export async function syncInBackground(
	connectionId: string
): Promise<{ result: BackgroundResult; message?: string }> {
	return withConnectionLock(`conn:${connectionId}`, () =>
		syncInBackgroundLocked(connectionId)
	)
}
