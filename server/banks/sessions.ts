/**
 * In-memory login sessions. A bank login is a multi-request conversation
 * (credentials → choose 2FA method → enter code), so the live browser is kept
 * here between requests and torn down when done or abandoned.
 */
import { randomUUID } from "node:crypto"
import { decrypt, encrypt } from "../crypto.ts"
import { db } from "../db.ts"
import { PaypalClient } from "./paypal/client.ts"
import { historyPlan, saveScrape } from "./store.ts"
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
export type ProviderId = keyof typeof PROVIDERS
export const isProvider = (v: string): v is ProviderId =>
  Object.hasOwn(PROVIDERS, v)

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

export function getSession(userId: string, id: string): LoginSession | null {
  const s = sessions.get(id)
  return s && s.userId === userId ? s : null
}

function maskUsername(u: string) {
  const t = u.trim()
  return t.length <= 4
    ? "••••"
    : `${"•".repeat(Math.min(8, t.length - 4))}${t.slice(-4)}`
}

/**
 * Advances a session after a login step. On success it scrapes in the
 * background and the client polls for the "done" step.
 */
async function after(s: LoginSession, step: LoginStep): Promise<SessionView> {
  if (step.type === "error") {
    s.step = step
    if (s.connectionId) {
      db.prepare(`UPDATE bank_connection SET last_error = ? WHERE id = ?`).run(
        step.message,
        s.connectionId
      )
    }
    await destroy(s)
    return { sessionId: s.id, step }
  }
  if (step.type !== "success") {
    s.step = step
    touch(s)
    return view(s)
  }

  s.step = { type: "syncing", message: "Signed in. Reading your accounts…" }
  touch(s)
  void (async () => {
    try {
      const accounts = await s.scraper.scrapeAccounts(
        (message) => {
          s.step = { type: "syncing", message }
          touch(s) // a long history read must not hit the idle timeout
        },
        historyPlan(s.connectionId, s.full)
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
    } catch (e) {
      const message = (e as Error).message || "Failed to read accounts."
      s.step = { type: "error", message }
      if (s.connectionId) {
        db.prepare(
          `UPDATE bank_connection SET last_error = ? WHERE id = ?`
        ).run(message, s.connectionId)
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
  if (s.busy) return view(s)
  s.busy = true
  try {
    return await after(s, await fn())
  } catch (e) {
    return after(s, {
      type: "error",
      message: `Unexpected error talking to ${PROVIDERS[s.provider].site}: ${(e as Error).message}`,
    })
  } finally {
    s.busy = false
  }
}

export async function startLogin(opts: {
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
      .prepare(
        `SELECT institution, credentials_enc, browser_state_enc FROM bank_connection WHERE id = ? AND user_id = ?`
      )
      .get(opts.connectionId, opts.userId) as
      | {
          institution: string
          credentials_enc: string | null
          browser_state_enc: string | null
        }
      | undefined
    if (!row || row.institution !== opts.provider)
      throw new Error("Connection not found")
    if (row.browser_state_enc) {
      try {
        browserState = decrypt(row.browser_state_enc)
      } catch {
        /* stale key; ignore */
      }
    }
    if ((!username || !password) && row.credentials_enc) {
      try {
        const creds = decrypt<{ username: string; password: string }>(
          row.credentials_enc
        )
        username = creds.username
        password = creds.password
        remember = true
      } catch {
        // Encrypted with a different APP_SECRET: ask for the password again.
        throw new Error(
          `Saved sign-in details can no longer be read. Enter your ${provider.secretName} to reconnect.`
        )
      }
    }
  }
  if (!username || !password)
    throw new Error("Username and password are required")
  if (provider.alwaysRemember) remember = true

  // One bank login per user at a time: each holds a whole browser open.
  for (const other of sessions.values()) {
    if (other.userId === opts.userId && other.step.type !== "done")
      await destroy(other)
  }

  const scraper = provider.create()
  const s: LoginSession = {
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
  sessions.set(s.id, s)
  touch(s)

  return run(s, async () => {
    await scraper.open(browserState)
    return scraper.login(username, password)
  })
}

export function chooseMfa(s: LoginSession, optionId: string) {
  return run(s, () => s.scraper.chooseMfa(optionId))
}

export function submitCode(s: LoginSession, code: string) {
  return run(s, () => s.scraper.submitCode(code))
}

export function poll(s: LoginSession) {
  if (s.step.type === "mfa_push")
    return run(s, () => s.scraper.waitForApproval())
  return Promise.resolve(view(s))
}

export async function cancel(s: LoginSession) {
  await destroy(s)
}

/** Close every open bank login for a user (their account is being deleted). */
export async function endUserSessions(userId: string) {
  const theirs = [...sessions.values()].filter((s) => s.userId === userId)
  for (const s of theirs) await destroy(s)
}

/** Whether the user is in the middle of signing in to a bank themselves. */
export function hasOpenLogin(userId: string) {
  for (const s of sessions.values())
    if (
      s.userId === userId &&
      s.step.type !== "done" &&
      s.step.type !== "error"
    )
      return true
  return false
}

export type BackgroundResult = "synced" | "needs-sign-in" | "skipped" | "failed"

/**
 * Refreshes one connection with its saved sign-in details, without anyone watching: the
 * scheduled "Refresh bank accounts" task. Reads only what's new since the last sync. When the
 * bank wants a two-factor code it stops there; the user reconnects from the dashboard as usual.
 */
export async function syncInBackground(
  connectionId: string
): Promise<{ result: BackgroundResult; message?: string }> {
  const row = db
    .prepare(
      `SELECT user_id AS userId, institution, username_masked AS usernameMasked, credentials_enc AS creds, browser_state_enc AS state
         FROM bank_connection WHERE id = ?`
    )
    .get(connectionId) as
    | {
        userId: string
        institution: string
        usernameMasked: string
        creds: string | null
        state: string | null
      }
    | undefined
  if (!row?.creds || !isProvider(row.institution))
    return { result: "skipped", message: "No saved sign-in details" }
  if (hasOpenLogin(row.userId))
    return { result: "skipped", message: "The user is signing in right now" }

  let creds: { username: string; password: string }
  let browserState: unknown
  try {
    creds = decrypt(row.creds)
  } catch {
    return {
      result: "skipped",
      message: "Saved sign-in details can no longer be read",
    }
  }
  try {
    if (row.state) browserState = decrypt(row.state)
  } catch {
    /* stale key; sign in without it */
  }

  const provider = PROVIDERS[row.institution]
  const client = provider.create()
  const setError = (message: string) =>
    db
      .prepare(`UPDATE bank_connection SET last_error = ? WHERE id = ?`)
      .run(message, connectionId)
  try {
    await client.open(browserState)
    const step = await client.login(creds.username, creds.password)
    if (step.type === "error") {
      setError(step.message)
      return { result: "failed", message: step.message }
    }
    // A code or an approval would need the user; leave the connection as it was.
    if (step.type !== "success")
      return {
        result: "needs-sign-in",
        message: `${provider.site} asked for a two-factor code`,
      }

    const accounts = await client.scrapeAccounts(
      () => {},
      historyPlan(connectionId, false)
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
  } catch (e) {
    const message = (e as Error).message || "Failed to read accounts."
    setError(message)
    return { result: "failed", message }
  } finally {
    creds.password = ""
    await client.close().catch(() => {})
  }
}
