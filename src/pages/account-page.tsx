import { useMemo, useState } from "react"
import { useParams } from "react-router"
import { AccountBackLink } from "@/components/accounts/account-back-link"
import { AccountDetailsButton } from "@/components/accounts/account-details-dialog"
import { accountPeriodItems } from "@/components/accounts/account-filter-items"
import { AccountStatCards } from "@/components/accounts/account-stat-cards"
import { AccountTransactionsCard } from "@/components/accounts/account-transactions-card"
import {
  isDebtAccount,
  shownRunningBalance,
  useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { BalanceChart, CategoryBars } from "@/components/common/charts"
import { RangePicker } from "@/components/common/range-picker"
import { RANGES, type RangeKey, rangeStart, useRangeState } from "@/lib/ranges"
import { TransactionSheet } from "@/components/transactions/transaction-sheet"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { Account, Category, Transaction } from "@/lib/api"
import { CATEGORY_LIST, CATEGORY_META } from "@/lib/categories"
import { balanceSeries, downloadCsv, spendByCategory } from "@/lib/finance"
import { ACCOUNT_TYPE_LABEL, formatRelative } from "@/lib/format"
import { useAccount } from "@/lib/queries"
import { useUrlState } from "@/lib/url-state"

type Flow = "all" | "in" | "out"

export function AccountPage() {
  const { id = "" } = useParams()
  const { data, error } = useAccount(id)

  if (error && !data) {
    return (
      <div className="grid gap-4">
        <AccountBackLink />
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="grid gap-6">
        <AccountBackLink />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return <AccountView account={data.account} transactions={data.transactions} />
}

const PAGE = 100

function AccountView({
  account: a,
  transactions,
}: {
  account: Account
  transactions: Transaction[]
}) {
  // Filters live in the URL, so reloading or coming back to the account keeps them.
  const ranges = Object.keys(RANGES) as RangeKey[]
  const [query, setQuery] = useUrlState<string>("q", "")
  const [flow, setFlow] = useUrlState<Flow>("flow", "all", ["all", "in", "out"])
  const [category, setCategory] = useUrlState<Category | "all">(
    "category",
    "all",
    ["all", ...CATEGORY_LIST]
  )
  const [period, setPeriod] = useUrlState<RangeKey>("period", "90d", ranges)
  const [chartRange, setChartRange] = useRangeState("chart", "90d")
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const includeOverdraft = useIncludeOverdraft()

  const from = rangeStart(period)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions.filter(
      (t) =>
        (!from || t.date >= from) &&
        (flow === "all" || (flow === "in" ? t.amount > 0 : t.amount < 0)) &&
        (category === "all" || t.category === category) &&
        (!q ||
          t.description.toLowerCase().includes(q) ||
          t.merchant.toLowerCase().includes(q) ||
          (t.note ?? "").toLowerCase().includes(q) ||
          Math.abs(t.amount).toFixed(2).includes(q))
    )
  }, [transactions, query, flow, category, from])

  const totals = useMemo(() => {
    let moneyIn = 0
    let moneyOut = 0
    for (const t of filtered) {
      if (t.amount > 0) moneyIn += t.amount
      else moneyOut += -t.amount
    }
    return { moneyIn, moneyOut }
  }, [filtered])

  const series = useMemo(
    () =>
      balanceSeries(
        [a],
        transactions,
        rangeStart(chartRange),
        includeOverdraft
      ),
    [a, transactions, chartRange, includeOverdraft]
  )
  const breakdown = useMemo(
    () => spendByCategory(transactions.filter((t) => !from || t.date >= from)),
    [transactions, from]
  )

  const debt = isDebtAccount(a)
  function resetLimit() {
    setLimit(PAGE)
  }

  function exportCsv() {
    downloadCsv(
      `${a.name.replace(/[^\w]+/g, "-").toLowerCase()}-transactions.csv`,
      [
        [
          "Date",
          "Merchant",
          "Description",
          "Category",
          "Amount",
          "Balance",
          "Pending",
          "Note",
        ],
        ...filtered.map((t) => [
          t.date,
          t.merchant,
          t.description,
          CATEGORY_META[t.category].label,
          t.amount.toFixed(2),
          shownRunningBalance(t, a, includeOverdraft)?.toFixed(2),
          t.pending ? "yes" : "",
          t.note,
        ]),
      ]
    )
  }

  return (
    <div className="grid gap-6">
      <AccountBackLink />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {a.name}
            </h1>
            <Badge variant="secondary">{ACCOUNT_TYPE_LABEL[a.type]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {a.numberMasked ? `${a.numberMasked} · ` : ""}
            {a.currency} · updated {formatRelative(a.updatedAt)}
          </p>
        </div>
        {a.type !== "wallet" && <AccountDetailsButton account={a} />}
      </div>

      <AccountStatCards account={a} />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>
              {debt ? "Balance owing over time" : "Balance over time"}
            </CardTitle>
            <CardDescription>
              End-of-day balance, rebuilt from posted transactions
            </CardDescription>
            <CardAction>
              <RangePicker value={chartRange} onChange={setChartRange} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <BalanceChart
              data={series}
              currency={a.currency}
              from={rangeStart(chartRange)}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Where it went</CardTitle>
            <CardDescription>
              {accountPeriodItems.find((p) => p.value === period)?.label} · tap
              to filter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBars
              data={breakdown.slice(0, 7)}
              selected={category === "all" ? null : category}
              onSelect={(c) => {
                setCategory(category === c ? "all" : c)
                resetLimit()
              }}
            />
          </CardContent>
        </Card>
      </div>

      <AccountTransactionsCard
        account={a}
        transactions={transactions}
        filtered={filtered}
        totals={totals}
        query={query}
        setQuery={setQuery}
        flow={flow}
        setFlow={setFlow}
        category={category}
        setCategory={setCategory}
        period={period}
        setPeriod={setPeriod}
        limit={limit}
        setLimit={setLimit}
        setSelected={setSelected}
        pageSize={PAGE}
        onExport={exportCsv}
      />

      <TransactionSheet
        transaction={selected}
        transactions={transactions}
        accounts={[a]}
        onClose={() => setSelected(null)}
        onSelect={setSelected}
        // The save invalidates every query, so the list refreshes on its own.
        onUpdated={(tx) => setSelected(tx)}
      />
    </div>
  )
}
