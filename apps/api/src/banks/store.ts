import { randomUUID } from "node:crypto"
import { encrypt } from "../security/crypto.ts"
import { and, eq, max, sql } from "drizzle-orm"
import { db } from "../db/connection.ts"
import {
	bankAccount,
	bankConnection,
	bankTransaction,
	goalPayment,
	invoicePayment,
	subscriptionCharge,
	workPayment,
} from "../db/schema/index.ts"
import { toCents, toCentsOrNull } from "@ledger/shared/money"
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
		.select({
			categoryOverride: bankTransaction.categoryOverride,
			note: bankTransaction.note,
			taxTag: bankTransaction.taxTag,
		})
		.from(bankTransaction)
		.where(eq(bankTransaction.id, fromId))
		.get()
	if (!from) {
		return
	}
	db.update(bankTransaction)
		.set({
			categoryOverride: sql`COALESCE(${from.categoryOverride}, ${bankTransaction.categoryOverride})`,
			note: sql`COALESCE(${from.note}, ${bankTransaction.note})`,
			taxTag: sql`COALESCE(${from.taxTag}, ${bankTransaction.taxTag})`,
		})
		.where(eq(bankTransaction.id, toId))
		.run()

	for (const table of [
		subscriptionCharge,
		goalPayment,
		workPayment,
		invoicePayment,
	]) {
		db.update(table)
			.set({ transactionId: toId })
			.where(eq(table.transactionId, fromId))
			.run()
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
	for (const transaction of transactions) {
		const fingerprint = txFingerprint(transaction, occurrences)
		incomingFingerprints.add(fingerprint)
		if (transaction.date < syncDateMin) {
			syncDateMin = transaction.date
		}
		if (transaction.date > syncDateMax) {
			syncDateMax = transaction.date
		}
		db.insert(bankTransaction)
			.values({
				id: randomUUID(),
				accountId,
				fingerprint,
				date: transaction.date,
				description: transaction.description,
				amount: toCents(transaction.amount),
				runningBalance: toCentsOrNull(transaction.runningBalance),
				pending: transaction.pending,
			})
			.onConflictDoUpdate({
				target: [
					bankTransaction.accountId,
					bankTransaction.fingerprint,
				],
				set: {
					date: sql`excluded.date`,
					description: sql`excluded.description`,
					amount: sql`excluded.amount`,
					runningBalance: sql`excluded.running_balance`,
					pending: sql`excluded.pending`,
				},
			})
			.run()
	}

	const stored: StoredTx[] = db
		.select({
			id: bankTransaction.id,
			fingerprint: bankTransaction.fingerprint,
			date: bankTransaction.date,
			description: bankTransaction.description,
			amount: bankTransaction.amount,
			pending: bankTransaction.pending,
		})
		.from(bankTransaction)
		.where(eq(bankTransaction.accountId, accountId))
		.all()

	const { pairs, deleteIds } = planTransactionCarryOvers(
		stored,
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
		for (const id of deleteIds) {
			db.delete(bankTransaction).where(eq(bankTransaction.id, id)).run()
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
	return db.transaction((tx) => {
		let connectionId = input.connectionId
		if (connectionId) {
			tx.update(bankConnection)
				.set({
					browserStateEnc: input.browserStateEnc,
					credentialsEnc: sql`COALESCE(${input.credentialsEnc}, ${bankConnection.credentialsEnc})`,
					usernameMasked: input.usernameMasked,
					status: "active",
					lastError: null,
					lastSyncedAt: sql`datetime('now')`,
				})
				.where(
					and(
						eq(bankConnection.id, connectionId),
						eq(bankConnection.userId, input.userId)
					)
				)
				.run()
		} else {
			connectionId = randomUUID()
			tx.insert(bankConnection)
				.values({
					id: connectionId,
					userId: input.userId,
					institution: input.institution,
					label: input.label,
					usernameMasked: input.usernameMasked,
					credentialsEnc: input.credentialsEnc,
					browserStateEnc: input.browserStateEnc,
					lastSyncedAt: sql`datetime('now')`,
				})
				.run()
		}

		for (const account of input.accounts) {
			const existing = tx
				.select({ id: bankAccount.id })
				.from(bankAccount)
				.where(
					and(
						eq(bankAccount.connectionId, connectionId),
						eq(bankAccount.externalKey, account.externalKey)
					)
				)
				.get()
			const accountId = existing?.id ?? randomUUID()
			const fields = {
				name: account.name,
				type: account.type,
				numberMasked: account.numberMasked,
				currency: account.currency,
				balance: toCentsOrNull(account.balance),
				available: toCentsOrNull(account.available),
				overdraftLimit: toCentsOrNull(account.overdraftLimit),
				overdraftUsed: toCentsOrNull(account.overdraftUsed),
				creditLimit: toCentsOrNull(account.creditLimit),
			}
			if (existing) {
				tx.update(bankAccount)
					.set({ ...fields, updatedAt: sql`datetime('now')` })
					.where(eq(bankAccount.id, accountId))
					.run()
			} else {
				tx.insert(bankAccount)
					.values({
						id: accountId,
						connectionId,
						externalKey: account.externalKey,
						...fields,
					})
					.run()
			}

			if (account.historyFrom) {
				tx.update(bankAccount)
					.set({
						historyFrom: sql`CASE WHEN ${bankAccount.historyFrom} IS NULL OR ${account.historyFrom} < ${bankAccount.historyFrom} THEN ${account.historyFrom} ELSE ${bankAccount.historyFrom} END`,
					})
					.where(eq(bankAccount.id, accountId))
					.run()
			}
			// Keep the last good details when a sync couldn't read them.
			if (account.details) {
				tx.update(bankAccount)
					.set({
						detailsEnc: encrypt(account.details),
						detailsUpdatedAt: sql`datetime('now')`,
					})
					.where(eq(bankAccount.id, accountId))
					.run()
			}

			syncTransactions(accountId, account.transactions)
		}
		return connectionId
	})
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
		.select({
			key: bankAccount.externalKey,
			historyFrom: bankAccount.historyFrom,
			latest: max(bankTransaction.date),
		})
		.from(bankAccount)
		.leftJoin(
			bankTransaction,
			eq(bankTransaction.accountId, bankAccount.id)
		)
		.where(eq(bankAccount.connectionId, connectionId))
		.groupBy(bankAccount.id)
		.all()
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
		.select({ id: bankAccount.id })
		.from(bankAccount)
		.where(
			and(
				eq(bankAccount.connectionId, connectionId),
				eq(bankAccount.externalKey, `paypal:${t.currency}`)
			)
		)
		.get()
	if (!account) {
		return null
	}
	const fingerprint = `id|${t.id}`
	const cents = toCents(t.amount)
	const inserted = db
		.insert(bankTransaction)
		.values({
			id: randomUUID(),
			accountId: account.id,
			fingerprint,
			date: t.date,
			description: t.description,
			amount: cents,
			pending: false,
		})
		.onConflictDoNothing({
			target: [bankTransaction.accountId, bankTransaction.fingerprint],
		})
		.returning({ id: bankTransaction.id })
		.all()
	// Move the balance too, so it's right until the next sync reads the real one.
	if (inserted.length > 0) {
		db.update(bankAccount)
			.set({
				balance: sql`COALESCE(${bankAccount.balance}, 0) + ${cents}`,
				updatedAt: sql`datetime('now')`,
			})
			.where(eq(bankAccount.id, account.id))
			.run()
	}
	const row = db
		.select({ id: bankTransaction.id })
		.from(bankTransaction)
		.where(
			and(
				eq(bankTransaction.accountId, account.id),
				eq(bankTransaction.fingerprint, fingerprint)
			)
		)
		.get()
	return row?.id ?? null
}
