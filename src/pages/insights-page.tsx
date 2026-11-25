import { X } from "lucide-react"
import { AnimatedMoney } from "@/components/common/count-up"
import { CashflowChart, CategoryBars } from "@/components/common/charts"
import { BudgetsCard } from "@/components/dashboard/budgets-card"
import { RangePicker } from "@/components/common/range-picker"
import { InsightsMerchants } from "@/components/insights/insights-merchants"
import { InsightsStat } from "@/components/insights/insights-stat"
import {
  INSIGHTS_PAGE_SIZE,
  useInsightsPage,
} from "@/components/insights/use-insights-page"
import { TransactionSheet } from "@/components/transactions/transaction-sheet"
import { TransactionsTable } from "@/components/transactions/transactions-table"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CATEGORY_META } from "@/lib/categories"
import { formatMoney } from "@/lib/format"

export function InsightsPage() {
  const p = useInsightsPage()

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
          <p className="text-sm text-muted-foreground">
            Where your money goes, across every account. Transfers between
            accounts are ignored.
          </p>
        </div>
        <RangePicker
          value={p.range}
          onChange={(r) => {
            p.setRange(r)
            p.setLimit(INSIGHTS_PAGE_SIZE)
          }}
        />
      </div>

      {p.txq.error && (
        <p className="text-sm text-destructive">{p.txq.error.message}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InsightsStat
          label="Spent"
          value={<AnimatedMoney value={p.stats.spent} />}
          hint="Net of refunds; excludes transfers & loan payments"
          change={
            p.previous && {
              now: p.stats.spent,
              before: p.previous.spent,
              label: p.previous.label,
              goodWhenUp: false,
            }
          }
          loading={p.loading}
        />
        <InsightsStat
          label="Income"
          value={<AnimatedMoney value={p.stats.income} />}
          hint="Pay and other money in"
          change={
            p.previous && {
              now: p.stats.income,
              before: p.previous.income,
              label: p.previous.label,
              goodWhenUp: true,
            }
          }
          loading={p.loading}
        />
        <InsightsStat
          label="Net"
          value={<AnimatedMoney value={p.stats.net} sign />}
          negative={p.stats.net < 0}
          hint={
            p.stats.debt > 0
              ? `Income − spent − ${formatMoney(p.stats.debt)} loan payments`
              : "Income − spent"
          }
          loading={p.loading}
        />
        <InsightsStat
          label="Average spend / day"
          value={<AnimatedMoney value={p.stats.perDay} />}
          hint={`Over ${p.stats.days} days`}
          loading={p.loading}
        />
      </div>
      {(p.home.mixed || p.home.skipped.length > 0) && (
        <p className="-mt-6 text-xs text-muted-foreground">
          Figures in {p.converter.home}, other currencies converted at today’s
          rates
          {p.home.skipped.length > 0 &&
            ` · ${p.home.skipped.join(", ")} accounts left out until rates load`}
          .
        </p>
      )}

      <BudgetsCard
        transactions={p.home.transactions}
        converter={p.converter}
        loading={p.loading}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>
              Click a category to filter merchants and transactions
            </CardDescription>
            {p.category && (
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => p.setCategory(null)}
                >
                  <X /> Clear
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {p.loading ? (
              <Skeleton className="h-64" />
            ) : (
              <CategoryBars
                data={p.categories}
                selected={p.category}
                onSelect={(c) => {
                  p.setCategory((cur) => (cur === c ? null : c))
                  p.setMerchant(null)
                  p.setLimit(INSIGHTS_PAGE_SIZE)
                }}
              />
            )}
          </CardContent>
        </Card>
        <InsightsMerchants
          loading={p.loading}
          merchants={p.merchants}
          category={p.category}
          merchant={p.merchant}
          onPick={(key) => {
            p.setMerchant((cur) => (cur === key ? null : key))
            p.setLimit(INSIGHTS_PAGE_SIZE)
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cash flow</CardTitle>
          <CardDescription>Money in vs out, last 12 months</CardDescription>
        </CardHeader>
        <CardContent>
          {p.loading ? (
            <Skeleton className="h-56" />
          ) : (
            <CashflowChart data={p.flow} className="h-64" />
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            {p.list.length} transaction{p.list.length === 1 ? "" : "s"}
            {p.category ? ` in ${CATEGORY_META[p.category].label}` : ""}
            {p.merchant
              ? ` at ${p.merchants.find((m) => m.merchantKey === p.merchant)?.merchant ?? "this merchant"}`
              : ""}
          </CardDescription>
          {(p.category || p.merchant) && (
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  p.setCategory(null)
                  p.setMerchant(null)
                }}
              >
                <X /> Clear filters
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {p.list.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No transactions in this period.
            </p>
          ) : (
            <TransactionsTable
              transactions={p.list.slice(0, p.limit).map(p.asRecorded)}
              accounts={p.accounts}
              onSelect={p.setSelected}
              showAccount
            />
          )}
          {p.list.length > p.limit && (
            <div className="border-t p-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => p.setLimit((l) => l + INSIGHTS_PAGE_SIZE * 2)}
              >
                Show {Math.min(INSIGHTS_PAGE_SIZE * 2, p.list.length - p.limit)}{" "}
                more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionSheet
        transaction={p.selected}
        transactions={p.txq.data?.transactions ?? []}
        accounts={p.accounts}
        onClose={() => p.setSelected(null)}
        onSelect={p.setSelected}
        onUpdated={(tx) => p.setSelected(tx)}
      />
    </div>
  )
}
