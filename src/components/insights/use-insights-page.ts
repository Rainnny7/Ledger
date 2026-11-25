import { useMemo, useState } from "react"
import { rangeDays, rangeLabel, rangeStart, useRangeState } from "@/lib/ranges"
import type { Category, Transaction } from "@/lib/api"
import { CATEGORY_LIST } from "@/lib/categories"
import { inHomeCurrency, useConverter } from "@/lib/currency"
import {
  isSpend,
  lastMonths,
  monthlyCashflow,
  spendByCategory,
  topMerchants,
  totalDebtPaid,
  totalIncome,
  totalSpent,
} from "@/lib/finance"
import { addDays, daysFromToday, isoDate } from "@/lib/format"
import { useOverview, useTransactions } from "@/lib/queries"
import { useUrlState } from "@/lib/url-state"

export const INSIGHTS_PAGE_SIZE = 50

export function useInsightsPage() {
  const overview = useOverview()
  const txq = useTransactions(null)
  const [range, setRange] = useRangeState("range", "30d")
  const [categoryParam, setCategoryParam] = useUrlState<Category | "">(
    "category",
    "",
    CATEGORY_LIST
  )
  const [merchantParam, setMerchantParam] = useUrlState<string>("merchant", "")
  const category = categoryParam || null
  const merchant = merchantParam || null
  const setCategory = (
    next: Category | null | ((cur: Category | null) => Category | null)
  ) =>
    setCategoryParam((typeof next === "function" ? next(category) : next) ?? "")
  const setMerchant = (
    next: string | null | ((cur: string | null) => string | null)
  ) =>
    setMerchantParam((typeof next === "function" ? next(merchant) : next) ?? "")
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [limit, setLimit] = useState(INSIGHTS_PAGE_SIZE)

  const accounts = useMemo(() => overview.data?.accounts ?? [], [overview.data])
  const converter = useConverter()
  const home = useMemo(
    () => inHomeCurrency(accounts, txq.data?.transactions ?? [], converter),
    [accounts, txq.data, converter]
  )
  const all = home.transactions
  const original = useMemo(
    () => new Map((txq.data?.transactions ?? []).map((t) => [t.id, t])),
    [txq.data]
  )
  const asRecorded = (t: Transaction) => original.get(t.id) ?? t
  const from = rangeStart(range)
  const inPeriod = useMemo(
    () => all.filter((t) => !from || t.date >= from),
    [all, from]
  )

  const stats = useMemo(() => {
    const spent = totalSpent(inPeriod)
    const income = totalIncome(inPeriod)
    const debt = totalDebtPaid(inPeriod)
    const earliest = inPeriod.at(-1)?.date ?? isoDate()
    const days = Math.max(
      1,
      -daysFromToday(from && from > earliest ? from : earliest) + 1
    )
    return {
      spent,
      income,
      debt,
      net: income - spent - debt,
      perDay: spent / days,
      days,
    }
  }, [inPeriod, from])

  const previous = useMemo(() => {
    const days = rangeDays(range)
    if (!days || !from) return null
    const prevFrom = addDays(from, -days)
    if (!all.length || all[all.length - 1].date > prevFrom) return null
    const txs = all.filter((t) => t.date >= prevFrom && t.date < from)
    return {
      spent: totalSpent(txs),
      income: totalIncome(txs),
      label: `vs previous ${rangeLabel(range)}`,
    }
  }, [all, from, range])

  const categories = useMemo(() => spendByCategory(inPeriod), [inPeriod])
  const merchants = useMemo(
    () =>
      topMerchants(
        category ? inPeriod.filter((t) => t.category === category) : inPeriod
      ),
    [inPeriod, category]
  )
  const flow = useMemo(() => monthlyCashflow(all, lastMonths(12)), [all])

  const list = useMemo(
    () =>
      inPeriod.filter(
        (t) =>
          (category ? t.category === category && isSpend(t) : true) &&
          (merchant ? t.merchantKey === merchant : true)
      ),
    [inPeriod, category, merchant]
  )

  const loading = !txq.data || !overview.data

  return {
    overview,
    txq,
    range,
    setRange,
    category,
    setCategory,
    merchant,
    setMerchant,
    selected,
    setSelected,
    limit,
    setLimit,
    accounts,
    converter,
    home,
    asRecorded,
    stats,
    previous,
    categories,
    merchants,
    flow,
    list,
    loading,
  }
}
