import { randomUUID } from "node:crypto"
import { encrypt } from "../security/crypto.ts"
import { db } from "../db/connection.ts"
import { toCents, toCentsOrNull } from "../../shared/money.ts"
import { planTransactionCarryOvers, type StoredTx } from "./sync-match.ts"
import type { ScrapedAccount, ScrapedTransaction } from "./types.ts"

/** The fingerprint keeps the decimal amount text it always had, so rows stored before cents still match. */
function txFingerprint(
	t: ScrapedTransaction,
	occurrences: Map<string, number>
) {
	if (t.externalId) {
		return `id|${t.externalId}`
	}
	const base = `${t.date}|${t.description.toLowerCase()}|${t.amount.toFixed(2)}|${t.pending ? "p" : "c"}`
	const occurrenceCount = occurrences.get(base) ?? 0
	occurrences.set(base, occurrenceCount + 1)
	return `${base}|${occurrenceCount}`
}

/** Move user fields and foreign links off a row that's about to be deleted. */
function moveTransactionAnnotations(fromId: string, toId: string) {
	const from = db
		.prepare(
			`SELECT category_override AS categoryOverride, note, tax_tag AS taxTag
         FROM bank_transaction WHERE id = ?`
		)
		.get(fromId) as
		| {
				categoryOverride: string | null
				note: string | null
				taxTag: string | null
		  }
		| undefined
	if (!from) {
		return
	}
	db.prepare(
		`UPDATE bank_transaction
        SET category_override = COALESCE(?, category_override),
            note = COALESCE(?, note),
            tax_tag = COALESCE(?, tax_tag)
      WHERE id = ?`
	).run(from.categoryOverride, from.note, from.taxTag, toId)

	db.prepare(
		`UPDATE subscription_charge SET transaction_id = ? WHERE transaction_id = ?`
	).run(toId, fromId)
	for (const table of [
		"goal_payment",
		"work_payment",
		"invoice_payment",
	] as const) {
		db.prepare(
			`UPDATE ${table} SET transaction_id = ? WHERE transaction_id = ?`
		).run(toId, fromId)
	}
}

function syncTransactions(
	accountId: string,
	transactions: ScrapedTransaction[]
) {
	if (transactions.length === 0) {
		return
	}

	const incomingFingerprints = new Set<string>()
	const occurrences = new Map<string, number>()
	let syncDateMin = transactions[0]!.date
	let syncDateMax = transactions[0]!.date
	const insertTx = db.prepare(
		`INSERT INTO bank_transaction (id, account_id, fingerprint, date, description, amount, running_balance, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (account_id, fingerprint) DO UPDATE SET
       date = excluded.date,
       description = excluded.description,
       amount = excluded.amount,
       running_balance = excluded.running_balance,
       pending = excluded.pending`
	)

	for (const transaction of transactions) {
		const fingerprint = txFingerprint(transaction, occurrences)
		incomingFingerprints.add(fingerprint)
		if (transaction.date < syncDateMin) {
			syncDateMin = transaction.date
		}
		if (transaction.date > syncDateMax) {
			syncDateMax = transaction.date
		}
		insertTx.run(
			randomUUID(),
			accountId,
			fingerprint,
			transaction.date,
			transaction.description,
			toCents(transaction.amount),
			toCentsOrNull(transaction.runningBalance),
			transaction.pending ? 1 : 0
		)
	}

	const stored = db
		.prepare(
			`SELECT id, fingerprint, date, description, amount, pending
         FROM bank_transaction WHERE account_id = ?`
		)
		.all(accountId) as unknown as (Omit<StoredTx, "pending"> & {
		pending: number
	})[]

	const storedNorm: StoredTx[] = stored.map((row) => ({
		...row,
		pending: row.pending !== 0,
	}))

	const { pairs, deleteIds } = planTransactionCarryOvers(
		storedNorm,
		incomingFingerprints,
		syncDateMin,
		syncDateMax
	)
	for (const { fromId, toId } of pairs) {
		if (fromId !== toId) {
			moveTransactionAnnotations(fromId, toId)
		}
	}
	if (deleteIds.length) {
		const del = db.prepare(`DELETE FROM bank_transaction WHERE id = ?`)
		for (const id of deleteIds) {
			del.run(id)
		}
	}
}

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
		for (const account of input.accounts) {
			const existing = findAccount.get(
				connectionId,
				account.externalKey
			) as { id: string } | undefined
			const accountId = existing?.id ?? randomUUID()
			const vals = [
				account.name,
				account.type,
				account.numberMasked,
				account.currency,
				toCentsOrNull(account.balance),
				toCentsOrNull(account.available),
				toCentsOrNull(account.overdraftLimit),
				toCentsOrNull(account.overdraftUsed),
				toCentsOrNull(account.creditLimit),
			] as const
			if (existing) {
				updateAccount.run(...vals, accountId)
			} else {
				insertAccount.run(
					accountId,
					connectionId,
					account.externalKey,
					...vals
				)
			}

			if (account.historyFrom) {
				setHistory.run(
					account.historyFrom,
					account.historyFrom,
					accountId
				)
			}
			// Keep the last good details when a sync couldn't read them.
			if (account.details) {
				setDetails.run(encrypt(account.details), accountId)
			}

			syncTransactions(accountId, account.transactions)
		}
		db.exec("COMMIT")
		return connectionId
	} catch (error) {
		db.exec("ROLLBACK")
		throw error
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
	if (!connectionId || full) {
		return () => null
	}
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
	const byKey = new Map(rows.map((row) => [row.key, row]))
	return (key) => {
		const row = byKey.get(key)
		if (!row?.historyFrom || !row.latest) {
			return null
		}
		const date = new Date(`${row.latest}T00:00:00Z`)
		date.setUTCDate(date.getUTCDate() - 21)
		return date.toISOString().slice(0, 10)
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
		.get(connectionId, `paypal:${t.currency}`) as { id: string } | null
	if (!account) {
		return null
	}
	const fingerprint = `id|${t.id}`
	const result = db
		.prepare(
			`INSERT INTO bank_transaction (id, account_id, fingerprint, date, description, amount, pending)
       VALUES (?, ?, ?, ?, ?, ?, 0) ON CONFLICT (account_id, fingerprint) DO NOTHING`
		)
		.run(
			randomUUID(),
			account.id,
			fingerprint,
			t.date,
			t.description,
			toCents(t.amount)
		)
	// Move the balance too, so it's right until the next sync reads the real one.
	if (Number(result.changes) > 0) {
		db.prepare(
			`UPDATE bank_account SET balance = COALESCE(balance, 0) + ?, updated_at = datetime('now') WHERE id = ?`
		).run(toCents(t.amount), account.id)
	}
	const row = db
		.prepare(
			`SELECT id FROM bank_transaction WHERE account_id = ? AND fingerprint = ?`
		)
		.get(account.id, fingerprint) as { id: string } | null
	return row?.id ?? null
}
