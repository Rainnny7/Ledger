import { isCategory } from "@ledger/shared/categories"
import { isTaxTag, type TaxTag } from "@ledger/shared/categories"
import { fromCents, fromCentsOrNull, toCents } from "@ledger/shared/money"
import {
	and,
	asc,
	desc,
	eq,
	gte,
	isNotNull,
	lte,
	sql,
	type SQL,
} from "drizzle-orm"
import { db } from "../db/connection.ts"
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
} from "../db/schema/index.ts"
import { classify } from "../finance/categorize.ts"
import { orderWithinDays } from "../finance/order.ts"
import type { EnrichedTx, TxRow } from "../routes/finance/types.ts"
import { PAYPAL_CHARGE } from "../routes/finance/types.ts"

type TxEnrichContext = {
	rules: Map<string, string>
	taxRules: Map<string, string>
	billPayments: Set<string>
	hasPaypal: boolean
}

/** How long a user's rules and bill links are reused, so a chat turn's several tool calls share one lookup but edits show up quickly. */
const ENRICH_CONTEXT_TTL_MS = 15_000

const enrichContextByUser = new Map<
	string,
	{ context: TxEnrichContext; loadedAt: number }
>()

/** Drop cached enrichment context (tests or long-lived processes). */
export function clearChatTransactionCaches(userId?: string) {
	if (userId) {
		enrichContextByUser.delete(userId)
		return
	}
	enrichContextByUser.clear()
}

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

/** Cached per-user context for classification (rules, tax, PayPal, bill links). */
export function enrichContextForChat(userId: string): TxEnrichContext {
	const hit = enrichContextByUser.get(userId)
	if (hit && Date.now() - hit.loadedAt < ENRICH_CONTEXT_TTL_MS) {
		return hit.context
	}
	const context: TxEnrichContext = {
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
	enrichContextByUser.set(userId, { context, loadedAt: Date.now() })
	return context
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

export type ChatTxFetchOptions = {
	accountId?: string
	from?: string
	until?: string
	minAmount?: number
	maxAmount?: number
	/** Description substring matched in SQL (case-insensitive); merchant matching still runs in JS. */
	textSql?: string
	limit?: number
}

export type ChatTxLoadResult = {
	transactions: EnrichedTx[]
	rowsScanned: number
	truncated: boolean
}

/** Load and enrich transactions for chat tools with SQL prefilters where possible. */
export function loadChatTransactions(
	userId: string,
	options: ChatTxFetchOptions = {}
): ChatTxLoadResult {
	const conditions: SQL[] = [eq(bankConnection.userId, userId)]
	if (options.accountId) {
		conditions.push(eq(bankTransaction.accountId, options.accountId))
	}
	if (options.from) {
		conditions.push(gte(bankTransaction.date, options.from))
	}
	if (options.until) {
		conditions.push(lte(bankTransaction.date, options.until))
	}
	if (options.minAmount !== undefined) {
		conditions.push(gte(bankTransaction.amount, toCents(options.minAmount)))
	}
	if (options.maxAmount !== undefined) {
		conditions.push(lte(bankTransaction.amount, toCents(options.maxAmount)))
	}
	if (options.textSql?.trim()) {
		const needle = `%${options.textSql.trim().replace(/%/g, "")}%`
		conditions.push(
			sql`lower(${bankTransaction.description}) like lower(${needle})`
		)
	}
	const rowLimit = options.limit ?? 50_000
	const rows = db
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
	const truncated = rows.length > rowLimit
	const slice = truncated ? rows.slice(0, rowLimit) : rows
	const context = enrichContextForChat(userId)
	return {
		transactions: enrichRows(slice, context),
		rowsScanned: slice.length,
		truncated,
	}
}
