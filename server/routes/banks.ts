import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { z } from "zod"
import type { auth } from "../auth/index.ts"
import { fromCentsOrNull } from "../../shared/money.ts"
import { decrypt } from "../crypto.ts"
import { db } from "../db.ts"
import type { AccountDetails } from "../banks/td/parse.ts"
import { loadTransactions } from "./finance/transactions.ts"
import {
  cancel,
  chooseMfa,
  getSession,
  isProvider,
  poll,
  PROVIDERS,
  startLogin,
  submitCode,
} from "../banks/sessions.ts"
import {
  deleteWebhook,
  PaypalApiError,
  purgePaypalTokenCache,
  registerWebhook,
} from "../banks/paypal/api.ts"
import { bankErrorForClient } from "../banks/errors.ts"
import {
  acquireStatementUpload,
  STATEMENT_MAX_REQUEST_BYTES,
} from "../banks/upload-gate.ts"
import { importStatements } from "../banks/statements.ts"
import { env } from "../env.ts"
import { isDemoUserId } from "../demo/personas.ts"
import { nextAutoSyncAt, waitingOnSignIn } from "../tasks.ts"
import { boundedString, id, validate } from "../validation.ts"

type Vars = { Variables: { user: typeof auth.$Infer.Session.user } }

export const banks = new Hono<Vars>()

const idParam = z.object({ id: id })
const providerParam = z.object({ provider: boundedString(32) })

// ---------------------------------------------------------------- connect / 2FA flow

const connectBody = z.object({
  username: boundedString(200).trim().min(1).optional(),
  password: boundedString(200).min(1).optional(),
  remember: z.boolean().optional(),
  connectionId: id.optional(),
  full: z.boolean().optional(),
})

const mfaBody = z.object({ optionId: boundedString(200).min(1) })
const codeBody = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{4,10}$/),
})

banks.post(
  "/connect/:provider",
  validate("param", providerParam),
  validate("json", connectBody),
  async (c) => {
    const { provider } = c.req.valid("param")
    if (!isProvider(provider)) return c.json({ error: "Unknown provider" }, 404)
    const body = c.req.valid("json")
    try {
      return c.json(
        await startLogin({ userId: c.var.user.id, provider, ...body })
      )
    } catch (e) {
      return c.json(
        {
          error: bankErrorForClient(e, "connect", {
            site: isProvider(provider) ? PROVIDERS[provider].site : undefined,
          }),
        },
        400
      )
    }
  }
)

banks.get("/connect/sessions/:id", validate("param", idParam), async (c) => {
  const { id: sessionId } = c.req.valid("param")
  const s = getSession(c.var.user.id, sessionId)
  if (!s) return c.json({ error: "Session expired. Please start again." }, 404)
  return c.json(await poll(s))
})

banks.post(
  "/connect/sessions/:id/mfa",
  validate("param", idParam),
  validate("json", mfaBody),
  async (c) => {
    const { id: sessionId } = c.req.valid("param")
    const s = getSession(c.var.user.id, sessionId)
    if (!s)
      return c.json({ error: "Session expired. Please start again." }, 404)
    const { optionId } = c.req.valid("json")
    return c.json(await chooseMfa(s, optionId))
  }
)

banks.post(
  "/connect/sessions/:id/code",
  validate("param", idParam),
  validate("json", codeBody),
  async (c) => {
    const { id: sessionId } = c.req.valid("param")
    const s = getSession(c.var.user.id, sessionId)
    if (!s)
      return c.json({ error: "Session expired. Please start again." }, 404)
    const { code } = c.req.valid("json")
    return c.json(await submitCode(s, code))
  }
)

banks.delete("/connect/sessions/:id", validate("param", idParam), async (c) => {
  const { id: sessionId } = c.req.valid("param")
  const s = getSession(c.var.user.id, sessionId)
  if (s) await cancel(s)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- statement uploads

export const STATEMENT_UPLOAD_PATH = "/api/banks/statements"

const statementForm = z
  .object({
    connectionId: z.preprocess(
      (v) => (typeof v === "string" && v ? v : undefined),
      id.optional()
    ),
    files: z
      .union([z.instanceof(File), z.array(z.instanceof(File))])
      .optional(),
  })
  .refine(
    (d) => {
      const raw = d.files
      const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
      return list.filter((f): f is File => f instanceof File).length > 0
    },
    {
      message: "Choose at least one statement PDF or .zip file.",
      path: ["files"],
    }
  )

/** TD statement PDFs, or .zip archives of them, for history older than EasyWeb's 18 months. */
banks.post(
  "/statements",
  bodyLimit({
    maxSize: STATEMENT_MAX_REQUEST_BYTES,
    onError: (c) =>
      c.json({ error: "Upload is too large (50 MB at most)." }, 413),
  }),
  validate("form", statementForm),
  async (c) => {
    const slot = acquireStatementUpload(c.var.user.id)
    if (!slot.ok) {
      return c.json(
        {
          error:
            slot.reason === "user"
              ? "Another statement upload is already running for your account."
              : "The server is busy with other statement uploads. Try again shortly.",
        },
        429
      )
    }
    try {
      const { connectionId, files: rawFiles } = c.req.valid("form")
      const files = (
        rawFiles === undefined
          ? []
          : Array.isArray(rawFiles)
            ? rawFiles
            : [rawFiles]
      ).filter((f): f is File => f instanceof File)
      const uploads = await Promise.all(
        files.map(async (f) => {
          const bytes = new Uint8Array(await f.arrayBuffer())
          return { name: f.name, bytes }
        })
      )
      return c.json(
        await importStatements(c.var.user.id, uploads, connectionId)
      )
    } finally {
      slot.release()
    }
  }
)

// ---------------------------------------------------------------- read data

const ACCOUNT_MONEY = [
  "balance",
  "available",
  "overdraftLimit",
  "overdraftUsed",
  "creditLimit",
] as const

/** An account row with its stored cents turned into the decimal amounts the API speaks. */
function accountFromCents<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>
  for (const k of ACCOUNT_MONEY)
    out[k] = fromCentsOrNull(out[k] as number | null)
  return out as T
}

banks.get("/connections", (c) => {
  const connections = db
    .prepare(
      `SELECT id, institution, label, username_masked AS usernameMasked, status,
              last_synced_at AS lastSyncedAt, last_error AS lastError, created_at AS createdAt,
              credentials_enc IS NOT NULL AS savedCredentials, webhook_id IS NOT NULL AS instantUpdates, webhook_at AS lastEventAt
         FROM bank_connection WHERE user_id = ? ORDER BY created_at`
    )
    .all(c.var.user.id)
  const accounts = db
    .prepare(
      `SELECT a.id, a.connection_id AS connectionId, a.name, a.type, a.number_masked AS numberMasked, a.currency,
              a.balance, a.available, a.overdraft_limit AS overdraftLimit, a.overdraft_used AS overdraftUsed,
              a.credit_limit AS creditLimit, a.updated_at AS updatedAt,
              COALESCE(cnt.n, 0) AS transactionCount
         FROM bank_account a
         JOIN bank_connection c ON c.id = a.connection_id
         LEFT JOIN (
           SELECT account_id, COUNT(*) AS n FROM bank_transaction GROUP BY account_id
         ) cnt ON cnt.account_id = a.id
        WHERE c.user_id = ? ORDER BY a.type, a.name`
    )
    .all(c.var.user.id)
    .map(accountFromCents)
  return c.json({
    connections: connections.map((x) => {
      const r = x as {
        id: string
        savedCredentials: number
        instantUpdates: number
        lastSyncedAt: string | null
        lastError: string | null
      }
      const savedCredentials = Boolean(r.savedCredentials)
      return {
        ...x,
        savedCredentials,
        instantUpdates: Boolean(r.instantUpdates),
        nextSyncAt: isDemoUserId(c.var.user.id)
          ? null
          : nextAutoSyncAt({ ...r, savedCredentials }),
        needsSignIn:
          !isDemoUserId(c.var.user.id) &&
          waitingOnSignIn({ ...r, savedCredentials }),
      }
    }),
    accounts,
  })
})

banks.get("/accounts/:id", validate("param", idParam), (c) => {
  const { id: accountId } = c.req.valid("param")
  const account = db
    .prepare(
      `SELECT a.id, a.connection_id AS connectionId, a.name, a.type, a.number_masked AS numberMasked, a.currency,
              a.balance, a.available, a.overdraft_limit AS overdraftLimit, a.overdraft_used AS overdraftUsed,
              a.credit_limit AS creditLimit, a.updated_at AS updatedAt, a.history_from AS historyFrom,
              a.details_enc IS NOT NULL AS hasDetails
         FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id
        WHERE a.id = ? AND c.user_id = ?`
    )
    .get(accountId, c.var.user.id) as { hasDetails: number } | undefined
  if (!account) return c.json({ error: "Not found" }, 404)
  return c.json({
    account: {
      ...accountFromCents(account),
      hasDetails: Boolean(account.hasDetails),
    },
    transactions: loadTransactions(c.var.user.id, { accountId }),
  })
})

/** Direct deposit numbers + limits. Separate from the account so the full number is only sent on request. */
banks.get("/accounts/:id/details", validate("param", idParam), (c) => {
  const { id: accountId } = c.req.valid("param")
  const row = db
    .prepare(
      `SELECT a.details_enc AS enc, a.details_updated_at AS updatedAt
         FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id
        WHERE a.id = ? AND c.user_id = ?`
    )
    .get(accountId, c.var.user.id) as
    | { enc: string | null; updatedAt: string | null }
    | undefined
  if (!row) return c.json({ error: "Not found" }, 404)
  let details: AccountDetails | null = null
  try {
    details = row.enc ? decrypt<AccountDetails>(row.enc) : null
  } catch {
    // Written with a different APP_SECRET; the next sync replaces it.
  }
  c.header("Cache-Control", "no-store")
  return c.json({ details, updatedAt: details ? row.updatedAt : null })
})

banks.delete("/connections/:id", validate("param", idParam), async (c) => {
  const { id: connectionId } = c.req.valid("param")
  const hook = db
    .prepare(
      `SELECT webhook_id AS webhookId FROM bank_connection WHERE id = ? AND user_id = ? AND webhook_id IS NOT NULL`
    )
    .get(connectionId, c.var.user.id) as { webhookId: string } | undefined
  if (hook)
    await deleteWebhook(connectionId, hook.webhookId).catch((e) =>
      console.error("PayPal webhook removal failed", e)
    )
  purgePaypalTokenCache(connectionId)
  const r = db
    .prepare(`DELETE FROM bank_connection WHERE id = ? AND user_id = ?`)
    .run(connectionId, c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

banks.post(
  "/connections/:id/forget-credentials",
  validate("param", idParam),
  (c) => {
    const { id: connectionId } = c.req.valid("param")
    const row = db
      .prepare(
        `SELECT institution FROM bank_connection WHERE id = ? AND user_id = ?`
      )
      .get(connectionId, c.var.user.id) as { institution: string } | undefined
    if (!row) return c.json({ error: "Not found" }, 404)
    db.prepare(
      `UPDATE bank_connection SET credentials_enc = NULL WHERE id = ? AND user_id = ?`
    ).run(connectionId, c.var.user.id)
    if (row.institution === "paypal") purgePaypalTokenCache(connectionId)
    return c.json({ ok: true })
  }
)

// ---------------------------------------------------------------- PayPal instant updates (webhooks)

/** Where PayPal delivers this connection's events. */
export const webhookUrl = (connectionId: string) =>
  `${env.publicUrl}/api/webhooks/paypal/${connectionId}`

banks.post(
  "/connections/:id/instant-updates",
  validate("param", idParam),
  async (c) => {
    const { id: connectionId } = c.req.valid("param")
    const row = db
      .prepare(
        `SELECT institution, credentials_enc AS creds FROM bank_connection WHERE id = ? AND user_id = ?`
      )
      .get(connectionId, c.var.user.id) as
      | { institution: string; creds: string | null }
      | undefined
    if (!row || row.institution !== "paypal")
      return c.json({ error: "Not found" }, 404)
    const url = webhookUrl(connectionId)
    const host = new URL(url).hostname
    if (
      !url.startsWith("https://") ||
      host === "localhost" ||
      /^(127\.|10\.|192\.168\.|\[?::1)/.test(host)
    ) {
      return c.json(
        {
          error:
            "PayPal can only send updates to a public https:// address. Put Ledger behind one (a domain, or a tunnel such as Cloudflare Tunnel) and set PUBLIC_URL to it.",
        },
        400
      )
    }
    try {
      const webhookId = await registerWebhook(connectionId, url)
      db.prepare(
        `UPDATE bank_connection SET webhook_id = ? WHERE id = ? AND user_id = ?`
      ).run(webhookId, connectionId, c.var.user.id)
      return c.json({ ok: true, url })
    } catch (e) {
      console.error("PayPal webhook registration failed", e)
      const msg =
        e instanceof PaypalApiError ? e.message : "Could not reach PayPal."
      return c.json({ error: `PayPal did not accept the webhook: ${msg}` }, 502)
    }
  }
)

banks.delete(
  "/connections/:id/instant-updates",
  validate("param", idParam),
  async (c) => {
    const { id: connectionId } = c.req.valid("param")
    const row = db
      .prepare(
        `SELECT webhook_id AS webhookId FROM bank_connection WHERE id = ? AND user_id = ?`
      )
      .get(connectionId, c.var.user.id) as
      | { webhookId: string | null }
      | undefined
    if (!row) return c.json({ error: "Not found" }, 404)
    if (row.webhookId) {
      try {
        await deleteWebhook(connectionId, row.webhookId)
      } catch (e) {
        console.error("PayPal webhook removal failed", e)
      }
    }
    db.prepare(
      `UPDATE bank_connection SET webhook_id = NULL WHERE id = ? AND user_id = ?`
    ).run(connectionId, c.var.user.id)
    return c.json({ ok: true })
  }
)
