import type { TagFilter } from "@/components/transactions/transactions-filter-items"
import type { Category, Transaction } from "@/lib/api"
import { CATEGORY_META, TAX_TAG_META } from "@/lib/categories"
import { formatMoney, formatShortDate } from "@/lib/format"
import type { RangeKey } from "@/lib/ranges"
import { rangeLabel } from "@/lib/ranges"

/** Prompt for one transaction row (search_transactions-friendly). */
export function transactionChargeAskPrompt(
	transaction: Transaction,
	currency?: string
): string {
	const amount = formatMoney(transaction.amount, currency, { sign: true })
	const category = CATEGORY_META[transaction.category].label
	return [
		`Tell me about my ${amount} charge at ${transaction.merchant} on ${formatShortDate(transaction.date)}.`,
		`Category: ${category}.`,
		transaction.description &&
		transaction.description !== transaction.merchant
			? `Bank description: ${transaction.description}.`
			: null,
		"Is this typical for me, and what should I know about it?",
	]
		.filter(Boolean)
		.join(" ")
}

interface TransactionsFilterContext {
	query: string
	accountName: string | null
	period: RangeKey
	category: Category | "all"
	tag: TagFilter
	flow: "all" | "in" | "out"
	merchantNames: string[]
	since: string | null
	until: string | null
	filteredCount: number
}

/** Prompt for the transactions toolbar with active filters. */
export function transactionsSpendingAskPrompt(
	context: TransactionsFilterContext
): string {
	const filters: string[] = []
	if (context.query.trim()) {
		filters.push(`search “${context.query.trim()}”`)
	}
	if (context.accountName) {
		filters.push(`account ${context.accountName}`)
	}
	if (context.since && context.until) {
		filters.push(`dates ${formatShortDate(context.since)}–${formatShortDate(context.until)}`)
	} else if (context.period !== "all") {
		filters.push(`period ${rangeLabel(context.period)}`)
	}
	if (context.category !== "all") {
		filters.push(`category ${CATEGORY_META[context.category].label}`)
	}
	if (context.tag !== "all") {
		filters.push(
			context.tag === "untagged"
				? "untagged for tax"
				: `tax tag ${TAX_TAG_META[context.tag].label}`
		)
	}
	if (context.flow !== "all") {
		filters.push(context.flow === "in" ? "money in only" : "spending only")
	}
	if (context.merchantNames.length > 0) {
		filters.push(`merchants ${context.merchantNames.join(", ")}`)
	}
	const filterLine =
		filters.length > 0
			? `Active filters: ${filters.join("; ")}.`
			: "No filters besides the default list."
	return [
		`Explain this spending view (${context.filteredCount.toLocaleString()} transactions).`,
		filterLine,
		"What stands out, and how does it compare to my usual patterns?",
	].join(" ")
}