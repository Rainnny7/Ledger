import type {
	Flow,
	TagFilter,
} from "@/components/transactions/transactions-filter-items"
import type { Category, Transaction } from "@/lib/api"
import { rangeStart } from "@/lib/ranges"
import type { RangeKey } from "@/lib/ranges"

/** React/UI entry: `filterTransactions`. */
export function filterTransactions(
	transactions: Transaction[],
	opts: {
		query: string
		accountId: string
		flow: Flow
		category: Category | "all"
		tag: TagFilter
		merchantKeys: Set<string>
		since: string | null
		until: string | null
		period: RangeKey
	}
) {
	const from = opts.since ?? rangeStart(opts.period)
	const normalizedQuery = opts.query.trim().toLowerCase()
	return transactions.filter(
		(transaction) =>
			(!from || transaction.date >= from) &&
			(!opts.until || transaction.date <= opts.until) &&
			(opts.tag === "all" ||
				(opts.tag === "untagged"
					? !transaction.taxTag
					: transaction.taxTag === opts.tag)) &&
			(opts.accountId === "all" ||
				transaction.accountId === opts.accountId) &&
			(opts.flow === "all" ||
				(opts.flow === "in"
					? transaction.amount > 0
					: transaction.amount < 0)) &&
			(opts.category === "all" ||
				transaction.category === opts.category) &&
			(opts.merchantKeys.size === 0 ||
				opts.merchantKeys.has(transaction.merchantKey)) &&
			(!normalizedQuery ||
				transaction.description
					.toLowerCase()
					.includes(normalizedQuery) ||
				transaction.merchant.toLowerCase().includes(normalizedQuery) ||
				(transaction.note ?? "")
					.toLowerCase()
					.includes(normalizedQuery) ||
				Math.abs(transaction.amount)
					.toFixed(2)
					.includes(normalizedQuery))
	)
}
