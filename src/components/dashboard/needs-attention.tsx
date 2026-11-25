import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  FileWarning,
  PiggyBank,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react"
import { useMemo } from "react"
import { Link } from "react-router"
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
  icon: LucideIcon
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
    for (const c of connections) {
      if (c.lastError)
        out.push({
          id: `c:${c.id}`,
          icon: AlertTriangle,
          tone: "danger",
          title: `${c.label} isn’t syncing`,
          detail: c.lastError,
          to: "/",
        })
      else if (c.needsSignIn)
        out.push({
          id: `c:${c.id}`,
          icon: ShieldAlert,
          tone: "danger",
          title: `${c.label} needs a two-factor sign-in`,
          detail: "Auto-refresh is paused until you sign in once",
          to: "/",
        })
    }
    for (const inv of invoices ?? []) {
      if (invoiceState(inv) !== "overdue") continue
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
    for (const s of subscriptions ?? []) {
      if (!s.active || s.access !== "owner") continue
      const days = daysFromToday(s.nextDue)
      if (days < 0 || days > 2) continue
      out.push({
        id: `s:${s.id}`,
        icon: CalendarClock,
        tone: "warn",
        title: `${s.name} renews ${formatRelativeDate(s.nextDue).toLowerCase()}`,
        detail: formatMoney(s.amount, s.currency),
        to: "/subscriptions",
      })
    }
    if (budgets?.length) {
      const from = startOfMonth()
      const spent = new Map(
        spendByCategory(transactions.filter((t) => t.date >= from)).map((r) => [
          r.category,
          r.total,
        ])
      )
      for (const b of budgets) {
        const limit = converter.toOr(b.amount, b.currency)
        const used = spent.get(b.category) ?? 0
        if (used <= limit) continue
        out.push({
          id: `b:${b.category}`,
          icon: PiggyBank,
          tone: "warn",
          title: `Over your ${CATEGORY_META[b.category].label.toLowerCase()} budget`,
          detail: `${formatMoney(used - limit)} over ${formatMoney(limit)} this month`,
          to: "/insights",
        })
      }
    }
    return out
  }, [connections, invoices, subscriptions, budgets, transactions, converter])

  if (alerts.length === 0) return null

  return (
    <Card size="sm" className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>
          {alerts.length} thing{alerts.length === 1 ? "" : "s"} to look at
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1 sm:grid-cols-2">
          {alerts.map((a) => (
            <li key={a.id}>
              <Link
                to={a.to}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    a.tone === "danger"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  )}
                >
                  <a.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.detail}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
