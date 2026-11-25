import { Elysia } from "elysia"
import { sessionUser } from "../session.ts"
import { z } from "zod"
import {
	boundedString,
	id,
	isoDate,
	jsonBody,
	limit,
} from "../../http/validation.ts"
import { classify } from "../../finance/categorize.ts"
import { CATEGORIES, isCategory } from "../../../shared/categories.ts"
import { isTaxTag, TAX_TAGS, type TaxTag } from "../../../shared/categories.ts"
import { fromCents, fromCentsOrNull } from "../../../shared/money.ts"
import { db } from "../../db/connection.ts"
import { orderWithinDays } from "../../finance/order.ts"
import type { EnrichedTx, TxRow } from "./types.ts"
import { PAYPAL_CHARGE } from "./types.ts"

function rulesFor(userId: string) {
	const rows = db
		.prepare(
			`SELECT merchant_key AS k, category AS c FROM category_rule WHERE user_id = ?`
		)
		.all(userId) as {
		k: string
		c: string
	}[]
	return new Map(rows.map((row) => [row.k, row.c]))
}

function taxRulesFor(userId: string) {
	const rows = db
		.prepare(
			`SELECT merchant_key AS k, tag AS t FROM tax_rule WHERE user_id = ?`
		)
		.all(userId) as { k: string; t: string }[]
	return new Map(rows.map((row) => [row.k, row.t]))
}

/** Transactions recorded as a payment for one of your Work bills or invoices: business income. */
function paidBillTransactions(userId: string) {
	const rows = db
		.prepare(
			`SELECT p.transaction_id AS id FROM work_payment p
         JOIN work_invoice i ON i.id = p.invoice_id JOIN work_job j ON j.id = i.job_id
        WHERE j.user_id = ? AND p.transaction_id IS NOT NULL
       UNION
       SELECT p.transaction_id FROM invoice_payment p JOIN invoice i ON i.id = p.invoice_id
        WHERE i.user_id = ? AND p.transaction_id IS NOT NULL`
		)
		.all(userId, userId) as { id: string }[]
	return new Set(rows.map((row) => row.id))
}

type TxFetchOpts = {
	accountId?: string
	from?: string
	until?: string
	id?: string
	/** Keyset page boundary: only days strictly before this date. */
	before?: string
	limit?: number
}

function fetchTxRows(userId: string, opts: TxFetchOpts = {}): TxRow[] {
	const where = ["c.user_id = ?"]
	const args: (string | number)[] = [userId]
	if (opts.id) {
		where.push("t.id = ?")
		args.push(opts.id)
	}
	if (opts.accountId) {
		where.push("t.account_id = ?")
		args.push(opts.accountId)
	}
	if (opts.from) {
		where.push("t.date >= ?")
		args.push(opts.from)
	}
	if (opts.until) {
		where.push("t.date <= ?")
		args.push(opts.until)
	}
	if (opts.before) {
		where.push("t.date < ?")
		args.push(opts.before)
	}
	const lim = opts.limit ?? 50_000
	return db
		.prepare(
			`SELECT t.id, t.account_id AS accountId, t.date, t.description, t.amount, t.running_balance AS runningBalance,
              t.pending, t.category_override AS categoryOverride, t.tax_tag AS taxTagRaw, t.note, t.created_at AS createdAt, c.institution
         FROM bank_transaction t
         JOIN bank_account a ON a.id = t.account_id
         JOIN bank_connection c ON c.id = a.connection_id
        WHERE ${where.join(" AND ")}
        ORDER BY t.date DESC, t.created_at DESC, t.rowid ASC
        LIMIT ?`
		)
		.all(...args, lim + 1) as unknown as TxRow[]
}

type TxEnrichContext = {
	rules: Map<string, string>
	taxRules: Map<string, string>
	billPayments: Set<string>
	hasPaypal: boolean
}

function enrichContext(userId: string): TxEnrichContext {
	return {
		rules: rulesFor(userId),
		taxRules: taxRulesFor(userId),
		billPayments: paidBillTransactions(userId),
		hasPaypal: Boolean(
			db
				.prepare(
					`SELECT 1 FROM bank_connection WHERE user_id = ? AND institution = 'paypal' LIMIT 1`
				)
				.get(userId)
		),
	}
}

function enrichRows(rows: TxRow[], context: TxEnrichContext): EnrichedTx[] {
	const ordered = orderWithinDays(rows)
	return ordered.map(
		({ categoryOverride, taxTagRaw, pending, institution, ...row }) => {
			const enriched = {
				...row,
				amount: fromCents(row.amount),
				runningBalance: fromCentsOrNull(row.runningBalance),
			}
			const auto = classify(enriched.description, enriched.amount)
			const rule = context.rules.get(auto.merchantKey)
			let category = auto.category
			let categorySource: EnrichedTx["categorySource"] = "auto"
			if (isCategory(categoryOverride)) {
				category = categoryOverride
				categorySource = "manual"
			} else if (isCategory(rule)) {
				category = rule
				categorySource = "rule"
			}
			const fundsPaypal =
				context.hasPaypal &&
				institution !== "paypal" &&
				enriched.amount < 0 &&
				categorySource !== "manual" &&
				PAYPAL_CHARGE.test(enriched.description.trim())
			if (fundsPaypal) {
				category = "transfers"
				categorySource = "auto"
			}
			const taxRule = context.taxRules.get(auto.merchantKey)
			let taxTag: TaxTag | null = null
			let taxTagSource: EnrichedTx["taxTagSource"] = null
			if (isTaxTag(taxTagRaw)) {
				taxTag = taxTagRaw
				taxTagSource = "manual"
			} else if (isTaxTag(taxRule)) {
				taxTag = taxRule
				taxTagSource = "rule"
			} else if (context.billPayments.has(enriched.id)) {
				taxTag = "business"
				taxTagSource = "auto"
			}
			return {
				...enriched,
				pending: Boolean(pending),
				merchant: auto.merchant,
				merchantKey: auto.merchantKey,
				category,
				categorySource,
				taxTag,
				taxTagSource,
				...(fundsPaypal ? { fundsPaypal } : {}),
			}
		}
	)
}

/** Every transaction the user owns (optionally one account), with merchant + category resolved. */
export function loadTransactions(
	userId: string,
	opts: {
		accountId?: string
		from?: string
		until?: string
		id?: string
		limit?: number
	} = {}
): EnrichedTx[] {
	const rows = fetchTxRows(userId, opts)
	return enrichRows(rows, enrichContext(userId))
}

/** `applyToMerchant` paths: ids with a manual override tagged to one merchant key. */
function manualOverrideIdsForMerchant(
	userId: string,
	merchantKey: string,
	column: "category_override" | "tax_tag"
) {
	const rows = db
		.prepare(
			`SELECT t.id, t.description, t.amount, t.category_override AS categoryOverride, t.tax_tag AS taxTagRaw
         FROM bank_transaction t
         JOIN bank_account a ON a.id = t.account_id
         JOIN bank_connection c ON c.id = a.connection_id
        WHERE c.user_id = ? AND t.${column} IS NOT NULL`
		)
		.all(userId) as {
		id: string
		description: string
		amount: number
		categoryOverride: string | null
		taxTagRaw: string | null
	}[]
	return rows
		.filter((row) => {
			const key = classify(
				row.description,
				fromCents(row.amount)
			).merchantKey
			if (key !== merchantKey) {
				return false
			}
			if (column === "tax_tag") {
				return isTaxTag(row.taxTagRaw)
			}
			return isCategory(row.categoryOverride)
		})
		.map((row) => row.id)
}

/** All transaction ids for one merchant (category clear path). */
function idsForMerchant(userId: string, merchantKey: string) {
	const rows = db
		.prepare(
			`SELECT t.id, t.description, t.amount
         FROM bank_transaction t
         JOIN bank_account a ON a.id = t.account_id
         JOIN bank_connection c ON c.id = a.connection_id
        WHERE c.user_id = ?`
		)
		.all(userId) as { id: string; description: string; amount: number }[]
	return rows
		.filter(
			(row) =>
				classify(row.description, fromCents(row.amount)).merchantKey ===
				merchantKey
		)
		.map((row) => row.id)
}

const txListQuery = z.object({
	from: isoDate.optional(),
	until: isoDate.optional(),
	limit: limit.optional(),
	cursor: isoDate.optional(),
})
const idParam = z.object({ id: id })

/** Elysia plugin wiring HTTP handlers for this area. */
export const transactionRoutes = new Elysia({
	name: "finance-transactions",
}).use(sessionUser)

transactionRoutes.get(
	"/transactions",
	({ user, query }) => {
		const queryInput = query
		const userId = user.id
		const pageSize = queryInput.limit ?? 100
		const enrichmentContext = enrichContext(userId)
		const filters = { from: queryInput.from, until: queryInput.until }
		// Pages end on whole days so same-day ordering (running-balance chains) matches the full list.
		// The cursor is the oldest day already sent; the next page starts the day before it.
		const rows = fetchTxRows(userId, {
			...filters,
			before: queryInput.cursor,
			limit: pageSize,
		})
		let page = rows
		let nextCursor: string | null = null
		if (rows.length > pageSize) {
			const edge = rows[pageSize].date
			page = [
				...rows.filter((row) => row.date > edge),
				...fetchTxRows(userId, { ...filters, from: edge, until: edge }),
			]
			nextCursor = edge
		}
		const transactions = enrichRows(page, enrichmentContext)
		return {
			transactions,
			nextCursor,
			categories: CATEGORIES,
		}
	},
	{ query: txListQuery }
)

const patchTx = z.object({
	/** null resets to the automatic category. */
	category: z.enum(CATEGORIES).nullable().optional(),
	/** Also file every transaction from this merchant under the category (now and in future syncs). */
	applyToMerchant: z.boolean().optional(),
	note: boundedString(500).nullable().optional(),
	/** Business / personal for the tax report; null clears it. */
	taxTag: z.enum(TAX_TAGS).nullable().optional(),
	/** Also tag every transaction from this merchant the same way (now and in future syncs). */
	applyTaxToMerchant: z.boolean().optional(),
})

const bulkBody = z
	.object({
		ids: z.array(id).min(1).max(5000),
		category: z.enum(CATEGORIES).nullable().optional(),
		taxTag: z.enum(TAX_TAGS).nullable().optional(),
	})
	.refine(
		(body) => (body.category !== undefined) !== (body.taxTag !== undefined),
		"Send a category or a tax tag"
	)

/** Files several transactions under one category, or tags them for taxes (null resets either). */
transactionRoutes.patch(
	"/transactions/bulk",
	async ({ user, body }) => {
		const column =
			body.category !== undefined ? "category_override" : "tax_tag"
		const value =
			body.category !== undefined ? body.category : (body.taxTag ?? null)
		const update = db.prepare(
			`UPDATE bank_transaction SET ${column} = ?
      WHERE id = ? AND account_id IN (SELECT a.id FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id WHERE c.user_id = ?)`
		)
		let updated = 0
		db.exec("BEGIN")
		try {
			for (const txId of new Set(body.ids)) {
				updated += Number(update.run(value, txId, user.id).changes)
			}
			db.exec("COMMIT")
		} catch (error) {
			db.exec("ROLLBACK")
			throw error
		}
		return { updated }
	},
	{ body: jsonBody(bulkBody) }
)

transactionRoutes.patch(
	"/transactions/:id",
	async ({ user, params, body, status }) => {
		const userId = user.id
		const { id: txId } = params
		const transaction = db
			.prepare(
				`SELECT t.id, t.description, t.amount FROM bank_transaction t
         JOIN bank_account a ON a.id = t.account_id JOIN bank_connection c ON c.id = a.connection_id
        WHERE t.id = ? AND c.user_id = ?`
			)
			.get(txId, userId) as
			| { id: string; description: string; amount: number }
			| undefined
		if (!transaction) {
			return status(404, { error: "Not found" })
		}

		const { category, applyToMerchant, note, taxTag, applyTaxToMerchant } =
			body
		if (note !== undefined) {
			db.prepare(`UPDATE bank_transaction SET note = ? WHERE id = ?`).run(
				note?.trim() || null,
				transaction.id
			)
		}
		if (taxTag !== undefined) {
			if (applyTaxToMerchant) {
				// Like categories: the rule carries the choice, so this merchant's own tags make way for it.
				const key = classify(
					transaction.description,
					transaction.amount
				).merchantKey
				if (taxTag === null) {
					db.prepare(
						`DELETE FROM tax_rule WHERE user_id = ? AND merchant_key = ?`
					).run(userId, key)
				} else {
					db.prepare(
						`INSERT INTO tax_rule (user_id, merchant_key, tag) VALUES (?, ?, ?)
           ON CONFLICT (user_id, merchant_key) DO UPDATE SET tag = excluded.tag`
					).run(userId, key, taxTag)
				}
				const ids = manualOverrideIdsForMerchant(userId, key, "tax_tag")
				const clear = db.prepare(
					`UPDATE bank_transaction SET tax_tag = NULL WHERE id = ?`
				)
				db.exec("BEGIN")
				try {
					for (const rowId of ids) {
						clear.run(rowId)
					}
					db.exec("COMMIT")
				} catch (error) {
					db.exec("ROLLBACK")
					throw error
				}
			} else {
				db.prepare(
					`UPDATE bank_transaction SET tax_tag = ? WHERE id = ?`
				).run(taxTag, transaction.id)
			}
		}
		if (category !== undefined) {
			const key = classify(
				transaction.description,
				transaction.amount
			).merchantKey
			if (applyToMerchant) {
				// The rule carries the choice; drop per-transaction overrides for that merchant so they follow it.
				if (category === null) {
					db.prepare(
						`DELETE FROM category_rule WHERE user_id = ? AND merchant_key = ?`
					).run(userId, key)
				} else {
					db.prepare(
						`INSERT INTO category_rule (user_id, merchant_key, category) VALUES (?, ?, ?)
           ON CONFLICT (user_id, merchant_key) DO UPDATE SET category = excluded.category`
					).run(userId, key, category)
				}
				const ids = idsForMerchant(userId, key)
				const clear = db.prepare(
					`UPDATE bank_transaction SET category_override = NULL WHERE id = ? AND category_override IS NOT NULL`
				)
				db.exec("BEGIN")
				try {
					for (const rowId of ids) {
						clear.run(rowId)
					}
					db.exec("COMMIT")
				} catch (error) {
					db.exec("ROLLBACK")
					throw error
				}
			} else {
				db.prepare(
					`UPDATE bank_transaction SET category_override = ? WHERE id = ?`
				).run(category, transaction.id)
			}
		}
		const [updated] = loadTransactions(userId, { id: transaction.id })
		return { transaction: updated }
	},
	{ params: idParam, body: jsonBody(patchTx) }
)
