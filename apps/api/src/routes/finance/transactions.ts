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
import { CATEGORIES, isCategory } from "@ledger/shared/categories"
import { isTaxTag, TAX_TAGS, type TaxTag } from "@ledger/shared/categories"
import { fromCents, fromCentsOrNull } from "@ledger/shared/money"
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	lt,
	lte,
	sql,
	type SQL,
} from "drizzle-orm"
import { db } from "../../db/connection.ts"
import {
	bankAccount,
	bankConnection,
	bankTransaction,
	categoryRule,
	invoice,
	invoicePayment,
	taxRule,
	workInvoice,
	workJob,
	workPayment,
} from "../../db/schema/index.ts"
import { orderWithinDays } from "../../finance/order.ts"
import type { EnrichedTx, TxRow } from "./types.ts"
import { PAYPAL_CHARGE } from "./types.ts"

function rulesFor(userId: string) {
	const rows = db
		.select({
			key: categoryRule.merchantKey,
			category: categoryRule.category,
		})
		.from(categoryRule)
		.where(eq(categoryRule.userId, userId))
		.all()
	return new Map(rows.map((row) => [row.key, row.category]))
}

function taxRulesFor(userId: string) {
	const rows = db
		.select({ key: taxRule.merchantKey, tag: taxRule.tag })
		.from(taxRule)
		.where(eq(taxRule.userId, userId))
		.all()
	return new Map(rows.map((row) => [row.key, row.tag]))
}

/** Ids of the bank accounts behind the user's connections, as a subquery. */
function accountIdsOf(userId: string) {
	return db
		.select({ id: bankAccount.id })
		.from(bankAccount)
		.innerJoin(
			bankConnection,
			eq(bankConnection.id, bankAccount.connectionId)
		)
		.where(eq(bankConnection.userId, userId))
}

/** Transactions recorded as a payment for one of your Work bills or invoices: business income. */
function paidBillTransactions(userId: string) {
	const workRows = db
		.select({ id: workPayment.transactionId })
		.from(workPayment)
		.innerJoin(workInvoice, eq(workInvoice.id, workPayment.invoiceId))
		.innerJoin(workJob, eq(workJob.id, workInvoice.jobId))
		.where(
			and(
				eq(workJob.userId, userId),
				isNotNull(workPayment.transactionId)
			)
		)
		.all()
	const invoiceRows = db
		.select({ id: invoicePayment.transactionId })
		.from(invoicePayment)
		.innerJoin(invoice, eq(invoice.id, invoicePayment.invoiceId))
		.where(
			and(
				eq(invoice.userId, userId),
				isNotNull(invoicePayment.transactionId)
			)
		)
		.all()
	return new Set([...workRows, ...invoiceRows].map((row) => row.id as string))
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
	const conditions: SQL[] = [eq(bankConnection.userId, userId)]
	if (opts.id) {
		conditions.push(eq(bankTransaction.id, opts.id))
	}
	if (opts.accountId) {
		conditions.push(eq(bankTransaction.accountId, opts.accountId))
	}
	if (opts.from) {
		conditions.push(gte(bankTransaction.date, opts.from))
	}
	if (opts.until) {
		conditions.push(lte(bankTransaction.date, opts.until))
	}
	if (opts.before) {
		conditions.push(lt(bankTransaction.date, opts.before))
	}
	const rowLimit = opts.limit ?? 50_000
	return db
		.select({
			id: bankTransaction.id,
			accountId: bankTransaction.accountId,
			date: bankTransaction.date,
			description: bankTransaction.description,
			amount: bankTransaction.amount,
			runningBalance: bankTransaction.runningBalance,
			pending: bankTransaction.pending,
			categoryOverride: bankTransaction.categoryOverride,
			taxTagRaw: bankTransaction.taxTag,
			note: bankTransaction.note,
			createdAt: bankTransaction.createdAt,
			institution: bankConnection.institution,
		})
		.from(bankTransaction)
		.innerJoin(bankAccount, eq(bankAccount.id, bankTransaction.accountId))
		.innerJoin(
			bankConnection,
			eq(bankConnection.id, bankAccount.connectionId)
		)
		.where(and(...conditions))
		.orderBy(
			desc(bankTransaction.date),
			desc(bankTransaction.createdAt),
			asc(sql`${bankTransaction}.rowid`)
		)
		.limit(rowLimit + 1)
		.all()
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
		hasPaypal:
			db
				.select({ id: bankConnection.id })
				.from(bankConnection)
				.where(
					and(
						eq(bankConnection.userId, userId),
						eq(bankConnection.institution, "paypal")
					)
				)
				.limit(1)
				.get() !== undefined,
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
			const taxRuleTag = context.taxRules.get(auto.merchantKey)
			let taxTag: TaxTag | null = null
			let taxTagSource: EnrichedTx["taxTagSource"] = null
			if (isTaxTag(taxTagRaw)) {
				taxTag = taxTagRaw
				taxTagSource = "manual"
			} else if (isTaxTag(taxRuleTag)) {
				taxTag = taxRuleTag
				taxTagSource = "rule"
			} else if (context.billPayments.has(enriched.id)) {
				taxTag = "business"
				taxTagSource = "auto"
			}
			return {
				...enriched,
				pending,
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
		.select({
			id: bankTransaction.id,
			description: bankTransaction.description,
			amount: bankTransaction.amount,
			categoryOverride: bankTransaction.categoryOverride,
			taxTagRaw: bankTransaction.taxTag,
		})
		.from(bankTransaction)
		.where(
			and(
				inArray(bankTransaction.accountId, accountIdsOf(userId)),
				isNotNull(
					column === "tax_tag"
						? bankTransaction.taxTag
						: bankTransaction.categoryOverride
				)
			)
		)
		.all()
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
		.select({
			id: bankTransaction.id,
			description: bankTransaction.description,
			amount: bankTransaction.amount,
		})
		.from(bankTransaction)
		.where(inArray(bankTransaction.accountId, accountIdsOf(userId)))
		.all()
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
		const changes =
			body.category !== undefined
				? { categoryOverride: body.category }
				: { taxTag: body.taxTag ?? null }
		const updated = db.transaction((tx) => {
			let updatedCount = 0
			for (const txId of new Set(body.ids)) {
				updatedCount += tx
					.update(bankTransaction)
					.set(changes)
					.where(
						and(
							eq(bankTransaction.id, txId),
							inArray(
								bankTransaction.accountId,
								accountIdsOf(user.id)
							)
						)
					)
					.returning({ id: bankTransaction.id })
					.all().length
			}
			return updatedCount
		})
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
			.select({
				id: bankTransaction.id,
				description: bankTransaction.description,
				amount: bankTransaction.amount,
			})
			.from(bankTransaction)
			.where(
				and(
					eq(bankTransaction.id, txId),
					inArray(bankTransaction.accountId, accountIdsOf(userId))
				)
			)
			.get()
		if (!transaction) {
			return status(404, { error: "Not found" })
		}

		const { category, applyToMerchant, note, taxTag, applyTaxToMerchant } =
			body
		if (note !== undefined) {
			db.update(bankTransaction)
				.set({ note: note?.trim() || null })
				.where(eq(bankTransaction.id, transaction.id))
				.run()
		}
		if (taxTag !== undefined) {
			if (applyTaxToMerchant) {
				// Like categories: the rule carries the choice, so this merchant's own tags make way for it.
				const key = classify(
					transaction.description,
					transaction.amount
				).merchantKey
				if (taxTag === null) {
					db.delete(taxRule)
						.where(
							and(
								eq(taxRule.userId, userId),
								eq(taxRule.merchantKey, key)
							)
						)
						.run()
				} else {
					db.insert(taxRule)
						.values({ userId, merchantKey: key, tag: taxTag })
						.onConflictDoUpdate({
							target: [taxRule.userId, taxRule.merchantKey],
							set: { tag: sql`excluded.tag` },
						})
						.run()
				}
				const ids = manualOverrideIdsForMerchant(userId, key, "tax_tag")
				db.transaction((tx) => {
					for (const rowId of ids) {
						tx.update(bankTransaction)
							.set({ taxTag: null })
							.where(eq(bankTransaction.id, rowId))
							.run()
					}
				})
			} else {
				db.update(bankTransaction)
					.set({ taxTag })
					.where(eq(bankTransaction.id, transaction.id))
					.run()
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
					db.delete(categoryRule)
						.where(
							and(
								eq(categoryRule.userId, userId),
								eq(categoryRule.merchantKey, key)
							)
						)
						.run()
				} else {
					db.insert(categoryRule)
						.values({ userId, merchantKey: key, category })
						.onConflictDoUpdate({
							target: [
								categoryRule.userId,
								categoryRule.merchantKey,
							],
							set: { category: sql`excluded.category` },
						})
						.run()
				}
				const ids = idsForMerchant(userId, key)
				db.transaction((tx) => {
					for (const rowId of ids) {
						tx.update(bankTransaction)
							.set({ categoryOverride: null })
							.where(
								and(
									eq(bankTransaction.id, rowId),
									isNotNull(bankTransaction.categoryOverride)
								)
							)
							.run()
					}
				})
			} else {
				db.update(bankTransaction)
					.set({ categoryOverride: category })
					.where(eq(bankTransaction.id, transaction.id))
					.run()
			}
		}
		const [updated] = loadTransactions(userId, { id: transaction.id })
		return { transaction: updated }
	},
	{ params: idParam, body: jsonBody(patchTx) }
)
