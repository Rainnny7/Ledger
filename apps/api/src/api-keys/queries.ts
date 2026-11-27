import { CATEGORIES } from "@ledger/shared/categories"
import { z } from "zod"
import { loadChatTransactions } from "../chat/transaction-load.ts"
import { isoDate, money } from "../http/validation.ts"

/** Most transactions one page may hold. */
export const API_TX_PAGE_MAX = 200

/** Most rows scanned for one request, so a single call can't read a whole decade of history. */
const API_TX_LOAD_CAP = 50_000

/** Query string of `GET /api/v1/transactions`. */
export const transactionsQuery = z.object({
	accountId: z.string().max(100).optional(),
	from: isoDate.optional(),
	until: isoDate.optional(),
	category: z.enum(CATEGORIES).optional(),
	type: z.enum(["spending", "income"]).optional(),
	minAmount: z.coerce.number().pipe(money).optional(),
	maxAmount: z.coerce.number().pipe(money).optional(),
	search: z.string().max(200).optional(),
	limit: z.coerce.number().int().min(1).max(API_TX_PAGE_MAX).default(50),
	offset: z.coerce.number().int().min(0).max(API_TX_LOAD_CAP).default(0),
})

/**
 * One page of a user's transactions, newest first. Reuses the chat/MCP loader, which is scoped to
 * the user's own connections, so an `accountId` that belongs to someone else simply matches nothing.
 */
export function listTransactionsForApi(
	userId: string,
	query: z.infer<typeof transactionsQuery>
) {
	const loaded = loadChatTransactions(userId, {
		accountId: query.accountId,
		from: query.from,
		until: query.until,
		minAmount: query.minAmount,
		maxAmount: query.maxAmount,
		textSql: query.search,
		limit: API_TX_LOAD_CAP,
	})
	const needle = query.search?.trim().toLowerCase()
	const matches = loaded.transactions.filter(
		(transaction) =>
			(!query.category || transaction.category === query.category) &&
			(query.type !== "spending" || transaction.amount < 0) &&
			(query.type !== "income" || transaction.amount > 0) &&
			(!needle ||
				`${transaction.merchant}\n${transaction.description}`
					.toLowerCase()
					.includes(needle))
	)
	return {
		total: matches.length,
		limit: query.limit,
		offset: query.offset,
		hasMore: query.offset + query.limit < matches.length,
		transactions: matches.slice(query.offset, query.offset + query.limit),
	}
}
