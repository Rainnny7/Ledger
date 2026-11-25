import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { auth } from '../auth.ts'
import { decrypt } from '../crypto.ts'
import { db } from '../db.ts'
import type { AccountDetails } from '../banks/td/parse.ts'
import { loadTransactions } from './finance.ts'
import { cancel, chooseMfa, getSession, isProvider, poll, startLogin, submitCode } from '../banks/sessions.ts'
import { deleteWebhook, PaypalApiError, registerWebhook } from '../banks/paypal/api.ts'
import { importStatements } from '../banks/statements.ts'
import { env } from '../env.ts'

type Vars = { Variables: { user: typeof auth.$Infer.Session.user } }

export const banks = new Hono<Vars>()

// ---------------------------------------------------------------- connect / 2FA flow

const connectBody = z.object({
  // PayPal sends its REST app's Client ID / Secret here (~80 characters each).
  username: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1).max(200).optional(),
  remember: z.boolean().optional(),
  connectionId: z.string().optional(),
  /** Force a full history re-read; otherwise refreshes only fetch what's new. */
  full: z.boolean().optional(),
})

banks.post('/connect/:provider', async (c) => {
  const provider = c.req.param('provider')
  if (!isProvider(provider)) return c.json({ error: 'Unknown provider' }, 404)
  const body = connectBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: 'Invalid request' }, 400)
  try {
    return c.json(await startLogin({ userId: c.var.user.id, provider, ...body.data }))
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

banks.get('/connect/sessions/:id', async (c) => {
  const s = getSession(c.var.user.id, c.req.param('id'))
  if (!s) return c.json({ error: 'Session expired. Please start again.' }, 404)
  return c.json(await poll(s))
})

banks.post('/connect/sessions/:id/mfa', async (c) => {
  const s = getSession(c.var.user.id, c.req.param('id'))
  if (!s) return c.json({ error: 'Session expired. Please start again.' }, 404)
  const body = z.object({ optionId: z.string() }).safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: 'Invalid request' }, 400)
  return c.json(await chooseMfa(s, body.data.optionId))
})

banks.post('/connect/sessions/:id/code', async (c) => {
  const s = getSession(c.var.user.id, c.req.param('id'))
  if (!s) return c.json({ error: 'Session expired. Please start again.' }, 404)
  const body = z.object({ code: z.string().trim().regex(/^[0-9A-Za-z]{4,10}$/) }).safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: 'Enter the code exactly as your bank sent it.' }, 400)
  return c.json(await submitCode(s, body.data.code))
})

banks.delete('/connect/sessions/:id', async (c) => {
  const s = getSession(c.var.user.id, c.req.param('id'))
  if (s) await cancel(s)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- statement uploads

export const STATEMENT_UPLOAD_PATH = '/api/banks/statements'

/** TD statement PDFs, or .zip archives of them, for history older than EasyWeb's 18 months. */
banks.post(
  '/statements',
  bodyLimit({ maxSize: 100 * 1024 * 1024, onError: (c) => c.json({ error: 'Upload is too large (100 MB at most).' }, 413) }),
  async (c) => {
    const form = await c.req.formData().catch(() => null)
    if (!form) return c.json({ error: 'Invalid upload' }, 400)
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    if (!files.length) return c.json({ error: 'Choose at least one statement PDF or .zip file.' }, 400)
    const connectionId = form.get('connectionId')
    const uploads = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))
    return c.json(await importStatements(c.var.user.id, uploads, typeof connectionId === 'string' && connectionId ? connectionId : undefined))
  },
)

// ---------------------------------------------------------------- read data

banks.get('/connections', (c) => {
  const connections = db
    .prepare(
      `SELECT id, institution, label, username_masked AS usernameMasked, status,
              last_synced_at AS lastSyncedAt, last_error AS lastError, created_at AS createdAt,
              credentials_enc IS NOT NULL AS savedCredentials, webhook_id IS NOT NULL AS instantUpdates, webhook_at AS lastEventAt
         FROM bank_connection WHERE user_id = ? ORDER BY created_at`,
    )
    .all(c.var.user.id)
  const accounts = db
    .prepare(
      `SELECT a.id, a.connection_id AS connectionId, a.name, a.type, a.number_masked AS numberMasked, a.currency,
              a.balance, a.available, a.overdraft_limit AS overdraftLimit, a.overdraft_used AS overdraftUsed,
              a.credit_limit AS creditLimit, a.updated_at AS updatedAt,
              (SELECT COUNT(*) FROM bank_transaction t WHERE t.account_id = a.id) AS transactionCount
         FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id
        WHERE c.user_id = ? ORDER BY a.type, a.name`,
    )
    .all(c.var.user.id)
  return c.json({
    connections: connections.map((x) => {
      const r = x as { savedCredentials: number; instantUpdates: number }
      return { ...x, savedCredentials: Boolean(r.savedCredentials), instantUpdates: Boolean(r.instantUpdates) }
    }),
    accounts,
  })
})

banks.get('/accounts/:id', (c) => {
  const account = db
    .prepare(
      `SELECT a.id, a.connection_id AS connectionId, a.name, a.type, a.number_masked AS numberMasked, a.currency,
              a.balance, a.available, a.overdraft_limit AS overdraftLimit, a.overdraft_used AS overdraftUsed,
              a.credit_limit AS creditLimit, a.updated_at AS updatedAt, a.history_from AS historyFrom,
              a.details_enc IS NOT NULL AS hasDetails
         FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id
        WHERE a.id = ? AND c.user_id = ?`,
    )
    .get(c.req.param('id'), c.var.user.id) as { hasDetails: number } | undefined
  if (!account) return c.json({ error: 'Not found' }, 404)
  return c.json({
    account: { ...account, hasDetails: Boolean(account.hasDetails) },
    transactions: loadTransactions(c.var.user.id, { accountId: c.req.param('id') }),
  })
})

/** Direct deposit numbers + limits. Separate from the account so the full number is only sent on request. */
banks.get('/accounts/:id/details', (c) => {
  const row = db
    .prepare(
      `SELECT a.details_enc AS enc, a.details_updated_at AS updatedAt
         FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id
        WHERE a.id = ? AND c.user_id = ?`,
    )
    .get(c.req.param('id'), c.var.user.id) as { enc: string | null; updatedAt: string | null } | undefined
  if (!row) return c.json({ error: 'Not found' }, 404)
  let details: AccountDetails | null = null
  try {
    details = row.enc ? decrypt<AccountDetails>(row.enc) : null
  } catch {
    // Written with a different APP_SECRET; the next sync replaces it.
  }
  c.header('Cache-Control', 'no-store')
  return c.json({ details, updatedAt: details ? row.updatedAt : null })
})

banks.delete('/connections/:id', async (c) => {
  // Take the webhook off the PayPal app as well, so PayPal stops calling a connection that's gone.
  const hook = db
    .prepare(`SELECT webhook_id AS webhookId FROM bank_connection WHERE id = ? AND user_id = ? AND webhook_id IS NOT NULL`)
    .get(c.req.param('id'), c.var.user.id) as { webhookId: string } | undefined
  if (hook) await deleteWebhook(c.req.param('id'), hook.webhookId).catch((e) => console.error('PayPal webhook removal failed', e))
  const r = db.prepare(`DELETE FROM bank_connection WHERE id = ? AND user_id = ?`).run(c.req.param('id'), c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404)
})

banks.post('/connections/:id/forget-credentials', (c) => {
  // API keys (PayPal) are what every refresh signs in with; removing the connection is how to drop them.
  db.prepare(`UPDATE bank_connection SET credentials_enc = NULL WHERE id = ? AND user_id = ? AND institution <> 'paypal'`).run(
    c.req.param('id'),
    c.var.user.id,
  )
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- PayPal instant updates (webhooks)

/** Where PayPal delivers this connection's events. */
export const webhookUrl = (connectionId: string) => `${env.publicUrl}/api/webhooks/paypal/${connectionId}`

banks.post('/connections/:id/instant-updates', async (c) => {
  const id = c.req.param('id')
  const row = db
    .prepare(`SELECT institution, credentials_enc AS creds FROM bank_connection WHERE id = ? AND user_id = ?`)
    .get(id, c.var.user.id) as { institution: string; creds: string | null } | undefined
  if (!row || row.institution !== 'paypal') return c.json({ error: 'Not found' }, 404)
  const url = webhookUrl(id)
  const host = new URL(url).hostname
  if (!url.startsWith('https://') || host === 'localhost' || /^(127\.|10\.|192\.168\.|\[?::1)/.test(host)) {
    return c.json(
      {
        error:
          'PayPal can only send updates to a public https:// address. Put Ledger behind one (a domain, or a tunnel such as Cloudflare Tunnel) and set PUBLIC_URL to it.',
      },
      400,
    )
  }
  try {
    const webhookId = await registerWebhook(id, url)
    db.prepare(`UPDATE bank_connection SET webhook_id = ? WHERE id = ?`).run(webhookId, id)
    return c.json({ ok: true, url })
  } catch (e) {
    console.error('PayPal webhook registration failed', e)
    const msg = e instanceof PaypalApiError ? e.message : 'Could not reach PayPal.'
    return c.json({ error: `PayPal did not accept the webhook: ${msg}` }, 502)
  }
})

banks.delete('/connections/:id/instant-updates', async (c) => {
  const id = c.req.param('id')
  const row = db.prepare(`SELECT webhook_id AS webhookId FROM bank_connection WHERE id = ? AND user_id = ?`).get(id, c.var.user.id) as
    | { webhookId: string | null }
    | undefined
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.webhookId) {
    try {
      await deleteWebhook(id, row.webhookId)
    } catch (e) {
      console.error('PayPal webhook removal failed', e)
    }
  }
  db.prepare(`UPDATE bank_connection SET webhook_id = NULL WHERE id = ?`).run(id)
  return c.json({ ok: true })
})
