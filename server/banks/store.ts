import { randomUUID } from "node:crypto"
import { encrypt } from "../crypto.ts"
import { db } from "../db.ts"
import type { ScrapedAccount } from "./types.ts"

interface SaveInput {
  userId: string
  connectionId: string | null
  institution: string
  label: string
  usernameMasked: string
  credentialsEnc: string | null
  browserStateEnc: string | null
  accounts: ScrapedAccount[]
}

/** Upsert a connection, its accounts and their transactions in one transaction. Returns the connection id. */
export function saveScrape(input: SaveInput): string {
  db.exec("BEGIN")
  try {
    let connectionId = input.connectionId
    if (connectionId) {
      db.prepare(
        `UPDATE bank_connection
           SET browser_state_enc = ?,
               credentials_enc = COALESCE(?, credentials_enc),
               username_masked = ?,
               status = 'active', last_error = NULL, last_synced_at = datetime('now')
         WHERE id = ? AND user_id = ?`
      ).run(
        input.browserStateEnc,
        input.credentialsEnc,
        input.usernameMasked,
        connectionId,
        input.userId
      )
    } else {
      connectionId = randomUUID()
      db.prepare(
        `INSERT INTO bank_connection (id, user_id, institution, label, username_masked, credentials_enc, browser_state_enc, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        connectionId,
        input.userId,
        input.institution,
        input.label,
        input.usernameMasked,
        input.credentialsEnc,
        input.browserStateEnc
      )
    }

    const findAccount = db.prepare(
      `SELECT id FROM bank_account WHERE connection_id = ? AND external_key = ?`
    )
    const insertAccount = db.prepare(
      `INSERT INTO bank_account (id, connection_id, external_key, name, type, number_masked, currency, balance, available, overdraft_limit, overdraft_used, credit_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const updateAccount = db.prepare(
      `UPDATE bank_account SET name = ?, type = ?, number_masked = ?, currency = ?, balance = ?, available = ?,
         overdraft_limit = ?, overdraft_used = ?, credit_limit = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    const setHistory = db.prepare(
      `UPDATE bank_account SET history_from = CASE WHEN history_from IS NULL OR ? < history_from THEN ? ELSE history_from END WHERE id = ?`
    )
    const setDetails = db.prepare(
      `UPDATE bank_account SET details_enc = ?, details_updated_at = datetime('now') WHERE id = ?`
    )
    const clearPending = db.prepare(
      `DELETE FROM bank_transaction WHERE account_id = ? AND pending = 1`
    )
    const insertTx = db.prepare(
      `INSERT INTO bank_transaction (id, account_id, fingerprint, date, description, amount, running_balance, pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id, fingerprint) DO UPDATE SET date = excluded.date, description = excluded.description,
         amount = excluded.amount, running_balance = excluded.running_balance, pending = excluded.pending`
    )

    for (const a of input.accounts) {
      const existing = findAccount.get(connectionId, a.externalKey) as
        | { id: string }
        | undefined
      const accountId = existing?.id ?? randomUUID()
      const vals = [
        a.name,
        a.type,
        a.numberMasked,
        a.currency,
        a.balance,
        a.available,
        a.overdraftLimit,
        a.overdraftUsed,
        a.creditLimit,
      ] as const
      if (existing) updateAccount.run(...vals, accountId)
      else insertAccount.run(accountId, connectionId, a.externalKey, ...vals)

      if (a.historyFrom) setHistory.run(a.historyFrom, a.historyFrom, accountId)
      // Keep the last good details when a sync couldn't read them.
      if (a.details) setDetails.run(encrypt(a.details), accountId)

      // Pending items get replaced each sync (they either post or disappear).
      clearPending.run(accountId)
      const occurrences = new Map<string, number>()
      for (const t of a.transactions) {
        let fingerprint: string
        if (t.externalId) fingerprint = `id|${t.externalId}`
        else {
          const base = `${t.date}|${t.description.toLowerCase()}|${t.amount.toFixed(2)}|${t.pending ? "p" : "c"}`
          const n = occurrences.get(base) ?? 0
          occurrences.set(base, n + 1)
          fingerprint = `${base}|${n}`
        }
        insertTx.run(
          randomUUID(),
          accountId,
          fingerprint,
          t.date,
          t.description,
          t.amount,
          t.runningBalance,
          t.pending ? 1 : 0
        )
      }
    }
    db.exec("COMMIT")
    return connectionId
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
}

/**
 * Decide how far back each account needs reading: a full backfill until one has succeeded,
 * afterwards a few weeks before the newest stored transaction (catches late-posting items).
 */
export function historyPlan(
  connectionId: string | null,
  full = false
): (externalKey: string) => string | null {
  // `full`: the user asked to re-read everything (fills gaps, picks up edits TD made to old rows).
  if (!connectionId || full) return () => null
  const rows = db
    .prepare(
      `SELECT a.external_key AS key, a.history_from AS historyFrom, MAX(t.date) AS latest
         FROM bank_account a LEFT JOIN bank_transaction t ON t.account_id = a.id
        WHERE a.connection_id = ? GROUP BY a.id`
    )
    .all(connectionId) as {
    key: string
    historyFrom: string | null
    latest: string | null
  }[]
  const byKey = new Map(rows.map((r) => [r.key, r]))
  return (key) => {
    const r = byKey.get(key)
    if (!r?.historyFrom || !r.latest) return null
    const d = new Date(`${r.latest}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 21)
    return d.toISOString().slice(0, 10)
  }
}

/**
 * Adds one PayPal transaction the moment a webhook reports it, ahead of Transaction Search (which
 * lags by up to ~3 hours). It uses the same `id|<transaction id>` fingerprint the sync does, so
 * the sync later just refreshes the row. Returns the transaction's id, or null when the
 * connection has no balance in that currency yet (the next sync will create it).
 */
export function recordPaypalTransaction(
  connectionId: string,
  t: {
    id: string
    date: string
    description: string
    amount: number
    currency: string
  }
): string | null {
  const account = db
    .prepare(
      `SELECT id FROM bank_account WHERE connection_id = ? AND external_key = ?`
    )
    .get(connectionId, `paypal:${t.currency}`) as { id: string } | undefined
  if (!account) return null
  const fingerprint = `id|${t.id}`
  const r = db
    .prepare(
      `INSERT INTO bank_transaction (id, account_id, fingerprint, date, description, amount, pending)
       VALUES (?, ?, ?, ?, ?, ?, 0) ON CONFLICT (account_id, fingerprint) DO NOTHING`
    )
    .run(randomUUID(), account.id, fingerprint, t.date, t.description, t.amount)
  // Move the balance too, so it's right until the next sync reads the real one.
  if (Number(r.changes) > 0) {
    db.prepare(
      `UPDATE bank_account SET balance = COALESCE(balance, 0) + ?, updated_at = datetime('now') WHERE id = ?`
    ).run(t.amount, account.id)
  }
  const row = db
    .prepare(
      `SELECT id FROM bank_transaction WHERE account_id = ? AND fingerprint = ?`
    )
    .get(account.id, fingerprint) as { id: string } | undefined
  return row?.id ?? null
}
