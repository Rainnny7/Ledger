import type {
  Flow,
  TagFilter,
} from "@/components/transactions/transactions-filter-items"
import type { Category, Transaction } from "@/lib/api"
import { rangeStart } from "@/lib/ranges"
import type { RangeKey } from "@/lib/ranges"

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
  const q = opts.query.trim().toLowerCase()
  return transactions.filter(
    (t) =>
      (!from || t.date >= from) &&
      (!opts.until || t.date <= opts.until) &&
      (opts.tag === "all" ||
        (opts.tag === "untagged" ? !t.taxTag : t.taxTag === opts.tag)) &&
      (opts.accountId === "all" || t.accountId === opts.accountId) &&
      (opts.flow === "all" ||
        (opts.flow === "in" ? t.amount > 0 : t.amount < 0)) &&
      (opts.category === "all" || t.category === opts.category) &&
      (opts.merchantKeys.size === 0 || opts.merchantKeys.has(t.merchantKey)) &&
      (!q ||
        t.description.toLowerCase().includes(q) ||
        t.merchant.toLowerCase().includes(q) ||
        (t.note ?? "").toLowerCase().includes(q) ||
        Math.abs(t.amount).toFixed(2).includes(q))
  )
}
