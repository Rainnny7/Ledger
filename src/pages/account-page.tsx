import { Money } from "@/components/money"
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Download,
  History,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import { AccountDetailsButton } from "@/components/account-details-dialog"
import {
  BalanceLabel,
  BalanceValue,
  CreditMeter,
  isDebtAccount,
  OverdraftMeter,
  shownRunningBalance,
  useIncludeOverdraft,
} from "@/components/account-figures"
import { BalanceChart, CategoryBars } from "@/components/charts"
import {
  RANGES,
  RangePicker,
  type RangeKey,
  rangeStart,
} from "@/components/range-picker"
import { TransactionSheet } from "@/components/transaction-sheet"
import { TransactionsTable } from "@/components/transactions-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SearchInput } from "@/components/search-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Account, Category, Transaction } from "@/lib/api"
import { CATEGORY_LIST, CATEGORY_META } from "@/lib/categories"
import { balanceSeries, downloadCsv, spendByCategory } from "@/lib/finance"
import {
  ACCOUNT_TYPE_LABEL,
  formatLongDate,
  formatRelative,
} from "@/lib/format"
import { useAccount } from "@/lib/queries"
import { useUrlState } from "@/lib/url-state"

type Flow = "all" | "in" | "out"
const PAGE = 100

export function AccountPage() {
  const { id = "" } = useParams()
  const { data, error } = useAccount(id)

  if (error && !data) {
    return (
      <div className="grid gap-4">
        <BackLink />
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="grid gap-6">
        <BackLink />
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

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> All accounts
    </Link>
  )
}

const periodItems = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last year" },
  { value: "all", label: "All time" },
]
const categoryItems = [
  { value: "all", label: "All categories" },
  ...CATEGORY_LIST.map((c) => ({ value: c, label: CATEGORY_META[c].label })),
]

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
  const [chartRange, setChartRange] = useUrlState<RangeKey>(
    "chart",
    "90d",
    ranges
  )
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
  const earliest = transactions.at(-1)?.date

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
      <BackLink />

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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>
              <BalanceLabel account={a} />
            </CardDescription>
            <CardTitle className="text-2xl! font-semibold">
              <BalanceValue account={a} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>
              {a.type === "credit" ? "Available credit" : "Available"}
            </CardDescription>
            <CardTitle className="text-2xl! font-semibold tabular-nums">
              <Money value={a.available} currency={a.currency} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>
              {debt ? "Credit limit" : "Overdraft"}
            </CardDescription>
            <CardTitle className="text-2xl! font-semibold tabular-nums">
              {debt ? (
                <Money
                  value={
                    a.creditLimit ??
                    (a.available !== null && a.balance !== null
                      ? a.available + a.balance
                      : null)
                  }
                  currency={a.currency}
                />
              ) : (a.overdraftUsed ?? 0) > 0 ? (
                <span className="text-destructive">
                  <Money value={a.overdraftUsed} currency={a.currency} />
                </span>
              ) : a.overdraftLimit ? (
                "Not in use"
              ) : (
                "None"
              )}
            </CardTitle>
          </CardHeader>
          {(debt
            ? a.type === "credit"
            : a.overdraftLimit || (a.overdraftUsed ?? 0) > 0) && (
            <CardContent>
              {debt ? (
                <CreditMeter account={a} />
              ) : (
                <OverdraftMeter account={a} />
              )}
            </CardContent>
          )}
        </Card>
      </div>

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
              {periodItems.find((p) => p.value === period)?.label} · tap to
              filter
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

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Transactions</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-2">
                <span>
                  {filtered.length.toLocaleString()} of{" "}
                  {transactions.length.toLocaleString()}
                </span>
                {earliest && (
                  <span className="inline-flex items-center gap-1">
                    <History className="size-3" /> history from{" "}
                    {formatLongDate(
                      a.historyFrom && a.historyFrom < earliest
                        ? a.historyFrom
                        : earliest
                    )}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <ArrowDownLeft className="size-4" />
                <span className="tabular-nums">
                  <Money value={totals.moneyIn} currency={a.currency} />
                </span>
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <ArrowUpRight className="size-4" />
                <span className="tabular-nums">
                  <Money value={totals.moneyOut} currency={a.currency} />
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={filtered.length === 0}
              >
                <Download /> CSV
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              placeholder="Search merchant, description, note or amount"
              value={query}
              onChange={(v) => {
                setQuery(v)
                resetLimit()
              }}
            />
            <Select
              items={periodItems}
              value={period}
              onValueChange={(v) => {
                if (v) setPeriod(v as RangeKey)
                resetLimit()
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodItems.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={categoryItems}
              value={category}
              onValueChange={(v) => {
                if (v) setCategory(v as Category | "all")
                resetLimit()
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryItems.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs
              value={flow}
              onValueChange={(v) => {
                setFlow(v as Flow)
                resetLimit()
              }}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="in">In</TabsTrigger>
                <TabsTrigger value="out">Out</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {transactions.length === 0
                ? "No transactions were found for this account yet."
                : "No transactions match."}
            </p>
          ) : (
            <TransactionsTable
              transactions={filtered.slice(0, limit)}
              accounts={[a]}
              onSelect={setSelected}
              showBalance={transactions.some((t) => t.runningBalance !== null)}
            />
          )}
          {filtered.length > limit && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimit((l) => l + PAGE)}
              >
                Show {Math.min(PAGE, filtered.length - limit)} more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
