import {
	AlertTriangle,
	ChevronRight,
	FileWarning,
	PiggyBank,
	ShieldAlert,
	type LucideIcon,
} from "lucide-react"
import { CalendarClockIcon } from "@/components/icons/calendar-clock"
import { SlotIcon } from "@/components/icons/slot-icon"
import type { AnimatedIconComponent } from "@/components/icons/use-animated-icon"
import { useAnimatedIcon } from "@/components/icons/use-animated-icon"
import { useMemo } from "react"
import { Link } from "@tanstack/react-router"
import { hrefTarget } from "@/components/common/href-target"
import { invoiceState } from "@/components/invoices/invoice-state"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import type { Connection, Transaction } from "@/lib/api"
import { CATEGORY_META } from "@/lib/categories"
import type { Converter } from "@/lib/currency"
import { spendByCategory, startOfMonth } from "@/lib/finance"
import { daysFromToday, formatMoney, formatRelativeDate } from "@/lib/format"
import { invoiceMoney } from "@/lib/invoice"
import { useBudgets, useInvoices, useSubscriptions } from "@/lib/queries"
import { cn } from "cn"

interface Alert {
	id: string
	icon: LucideIcon | AnimatedIconComponent
	tone: "danger" | "warn"
	title: string
	detail: string
	to: string
}

/**
 * Things to act on, gathered in one place: a bank that stopped syncing, an overdue invoice, a bill
 * due in the next couple of days, a budget gone over. Hidden when there's nothing.
 */
export function NeedsAttention({
	connections,
	transactions,
	converter,
}: {
	connections: Connection[]
	transactions: Transaction[]
	converter: Converter
}) {
	const invoices = useInvoices().data?.invoices
	const subscriptions = useSubscriptions().data?.subscriptions
	const budgets = useBudgets().data?.budgets

	const alerts = useMemo(() => {
		const out: Alert[] = []
		for (const connection of connections) {
			if (connection.lastError) {
				out.push({
					id: `c:${connection.id}`,
					icon: AlertTriangle,
					tone: "danger",
					title: `${connection.label} isn’t syncing`,
					detail: connection.lastError,
					to: `/#connection-${connection.id}`,
				})
			} else if (connection.needsSignIn) {
				out.push({
					id: `c:${connection.id}`,
					icon: ShieldAlert,
					tone: "danger",
					title: `${connection.label} needs a two-factor login`,
					detail: "Auto-refresh is paused until you log in once",
					to: `/#connection-${connection.id}`,
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
				icon: FileWarning,
				tone: "danger",
				title: `Invoice ${inv.number} is overdue`,
				detail: `${invoiceMoney(inv.balance, inv.currency)} from ${inv.client.name || "your client"} · ${late} day${late === 1 ? "" : "s"} late`,
				to: `/invoices/${inv.id}`,
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
				icon: CalendarClockIcon,
				tone: "warn",
				title: `${subscription.name} renews ${formatRelativeDate(subscription.nextDue).toLowerCase()}`,
				detail: formatMoney(subscription.amount, subscription.currency),
				to: "/subscriptions",
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
					icon: PiggyBank,
					tone: "warn",
					title: `Over your ${CATEGORY_META[budget.category].label.toLowerCase()} budget`,
					detail: `${formatMoney(used - limit)} over ${formatMoney(limit)} this month`,
					to: "/insights",
				})
			}
		}
		return out
	}, [connections, invoices, subscriptions, budgets, transactions, converter])

	if (alerts.length === 0) {
		return null
	}

	return (
		<Card size="sm" className="border-amber-500/30 bg-amber-500/5">
			<CardHeader>
				<CardTitle>Needs Attention</CardTitle>
				<CardDescription>
					{alerts.length} thing{alerts.length === 1 ? "" : "s"} to
					look at
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="grid gap-1 sm:grid-cols-2">
					{alerts.map((alert) => (
						<AlertRow key={alert.id} alert={alert} />
					))}
				</ul>
			</CardContent>
		</Card>
	)
}

function AlertRow({ alert }: { alert: Alert }) {
	const { ref: iconRef, handlers: iconHandlers } =
		useAnimatedIcon<HTMLAnchorElement>()
	return (
		<li>
			<Link
				{...hrefTarget(alert.to)}
				{...iconHandlers}
				hashScrollIntoView={{ behavior: "smooth", block: "start" }}
				className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-amber-500/[0.06]"
			>
				<span
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded-full",
						alert.tone === "danger"
							? "bg-destructive/10 text-destructive"
							: "bg-amber-500/15 text-amber-700 dark:text-amber-300"
					)}
				>
					<SlotIcon icon={alert.icon} iconRef={iconRef} size={16} />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate font-medium">
						{alert.title}
					</span>
					<span className="block truncate text-xs text-muted-foreground">
						{alert.detail}
					</span>
				</span>
				<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
			</Link>
		</li>
	)
}
