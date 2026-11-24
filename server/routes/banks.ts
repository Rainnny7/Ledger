import { Hono } from 'hono'
import { z } from 'zod'
import type { auth } from '../auth.ts'
import { decrypt } from '../crypto.ts'
import { db } from '../db.ts'
import type { AccountDetails } from '../banks/td/parse.ts'
import { loadTransactions } from './finance.ts'
import { cancel, chooseMfa, getSession, isProvider, poll, startLogin, submitCode } from '../banks/sessions.ts'

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

// ---------------------------------------------------------------- read data

banks.get('/connections', (c) => {
  const connections = db
    .prepare(
      `SELECT id, institution, label, username_masked AS usernameMasked, status,
              last_synced_at AS lastSyncedAt, last_error AS lastError, created_at AS createdAt,
              credentials_enc IS NOT NULL AS savedCredentials
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
    connections: connections.map((x) => ({ ...x, savedCredentials: Boolean((x as { savedCredentials: number }).savedCredentials) })),
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

banks.delete('/connections/:id', (c) => {
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
