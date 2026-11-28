import { useMemo } from "react"
import { invoiceState } from "@/components/invoices/invoice-state"
import type { Connection, Transaction } from "@/lib/api"
import { CATEGORY_META } from "@/lib/categories"
import type { Converter } from "@/lib/currency"
import { spendByCategory, startOfMonth } from "@/lib/finance"
import { daysFromToday, formatMoney, formatRelativeDate } from "@/lib/format"
import { invoiceMoney } from "@/lib/invoice"
import { useBudgets, useInvoices, useSubscriptions } from "@/lib/queries"

/** One row in the home Inbox: connection, invoice, subscription, or budget alert. */
export type DashboardAlert = {
	id: string
	tone: "danger" | "warn"
	title: string
	detail: string
	to: string
	action: string
}

/**
 * Builds connection, invoice, subscription and budget alerts for the dashboard Inbox.
 */
export function useDashboardAlerts({
	connections,
	transactions,
	converter,
}: {
	connections: Connection[]
	transactions: Transaction[]
	converter: Converter
}): DashboardAlert[] {
	const invoices = useInvoices().data?.invoices
	const subscriptions = useSubscriptions().data?.subscriptions
	const budgets = useBudgets().data?.budgets

	return useMemo(() => {
		const out: DashboardAlert[] = []
		for (const connection of connections) {
			if (connection.lastError) {
				out.push({
					id: `c:${connection.id}`,
					tone: "danger",
					title: `${connection.label} isn’t syncing`,
					detail: connection.lastError,
					to: `/accounts#connection-${connection.id}`,
					action: "Fix",
				})
			} else if (connection.needsSignIn) {
				out.push({
					id: `c:${connection.id}`,
					tone: "danger",
					title: `${connection.label} needs a two-factor login`,
					detail: "Auto-refresh is paused until you log in once",
					to: `/accounts#connection-${connection.id}`,
					action: "Sign in",
				})
			}
		}
		for (const inv of invoices ?? []) {
			if (invoiceState(inv) !== "overdue") {
				continue
			}
			const late = -daysFromToday(inv.dueDate!)
			out.push({
				id: `i:${inv.id}`,
				tone: "danger",
				title: `Invoice ${inv.number} is overdue`,
				detail: `${invoiceMoney(inv.balance, inv.currency)} from ${inv.client.name || "your client"} · ${late} day${late === 1 ? "" : "s"} late`,
				to: `/invoices/${inv.id}`,
				action: "View",
			})
		}
		for (const subscription of subscriptions ?? []) {
			if (!subscription.active || subscription.access !== "owner") {
				continue
			}
			const days = daysFromToday(subscription.nextDue)
			if (days < 0 || days > 2) {
				continue
			}
			out.push({
				id: `s:${subscription.id}`,
				tone: "warn",
				title: `${subscription.name} renews ${formatRelativeDate(subscription.nextDue).toLowerCase()}`,
				detail: formatMoney(subscription.amount, subscription.currency),
				to: "/subscriptions",
				action: "Manage",
			})
		}
		if (budgets?.length) {
			const from = startOfMonth()
			const spent = new Map(
				spendByCategory(
					transactions.filter(
						(transaction) => transaction.date >= from
					)
				).map((row) => [row.category, row.total])
			)
			for (const budget of budgets) {
				const limit = converter.toOr(budget.amount, budget.currency)
				const used = spent.get(budget.category) ?? 0
				if (used <= limit) {
					continue
				}
				out.push({
					id: `b:${budget.category}`,
					tone: "warn",
					title: `Over your ${CATEGORY_META[budget.category].label.toLowerCase()} budget`,
					detail: `${formatMoney(used - limit)} over ${formatMoney(limit)} this month`,
					to: "/insights",
					action: "Insights",
				})
			}
		}
		return out
	}, [connections, invoices, subscriptions, budgets, transactions, converter])
}
