import {
  bulkRecategorize,
  bulkRetag,
} from "@/components/transactions/transactions-page-bulk"
import { filterTransactions } from "@/components/transactions/transactions-page-filter"
import {
  TRANSACTIONS_PAGE,
  transactionCategoryItems,
  transactionPeriodItems,
  transactionTagItems,
} from "@/components/transactions/transactions-filter-items"
import { useTransactionsUrl } from "@/components/transactions/use-transactions-url"
import { type Transaction } from "@/lib/api"
import { CATEGORY_META, TAX_TAG_META } from "@/lib/categories"
import { inHomeCurrency, useConverter } from "@/lib/currency"
import { downloadCsv } from "@/lib/finance"
import { formatShortDate } from "@/lib/format"
import { useOverview, useTransactions } from "@/lib/queries"
import { useIntent } from "@/lib/url-state"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

export function useTransactionsPage() {
  const overview = useOverview()
  const txq = useTransactions(null)
  const converter = useConverter()
  const url = useTransactionsUrl()
  const {
    query,
    setQuery,
    accountId,
    setAccountId,
    category,
    setCategory,
    flow,
    setFlow,
    period,
    setPeriod,
    tag,
    setTag,
    links,
    setLinks,
    merchantKeys,
    since,
    until,
  } = url

  const [limit, setLimit] = useState(TRANSACTIONS_PAGE)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const lastPicked = useRef<string | null>(null)

  const accounts = useMemo(() => overview.data?.accounts ?? [], [overview.data])
  const transactions = useMemo(() => txq.data?.transactions ?? [], [txq.data])
  const accountItems = useMemo(
    () => [
      { value: "all", label: "All accounts" },
      ...accounts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [accounts]
  )

  const filtered = useMemo(
    () =>
      filterTransactions(transactions, {
        query,
        accountId,
        flow,
        category,
        tag,
        merchantKeys,
        since,
        until,
        period,
      }),
    [
      transactions,
      query,
      accountId,
      flow,
      category,
      since,
      until,
      tag,
      merchantKeys,
      period,
    ]
  )

  const totals = useMemo(() => {
    const home = inHomeCurrency(accounts, filtered, converter)
    let moneyIn = 0
    let moneyOut = 0
    for (const t of home.transactions) {
      if (t.amount > 0) moneyIn += t.amount
      else moneyOut -= t.amount
    }
    return { moneyIn, moneyOut, mixed: home.mixed }
  }, [accounts, filtered, converter])

  const shown = filtered.slice(0, limit)
  const pickedShown = shown.filter((t) => picked.has(t.id))
  const allShownPicked = shown.length > 0 && pickedShown.length === shown.length
  const filtersOn =
    query ||
    accountId !== "all" ||
    category !== "all" ||
    flow !== "all" ||
    tag !== "all" ||
    merchantKeys.size > 0 ||
    since
  const merchantNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const t of transactions)
      if (merchantKeys.has(t.merchantKey) && !names.has(t.merchantKey))
        names.set(t.merchantKey, t.merchant)
    return [...names.values()]
  }, [transactions, merchantKeys])
  const sinceLabel = until
    ? `${formatShortDate(since!)} – ${formatShortDate(until)}`
    : `Since ${formatShortDate(since ?? "")}`
  const periodOptions = since
    ? [{ value: "since", label: sinceLabel }, ...transactionPeriodItems]
    : transactionPeriodItems

  function changed() {
    setLimit(TRANSACTIONS_PAGE)
    setPicked(new Set())
    lastPicked.current = null
  }

  function toggle(t: Transaction, range: boolean) {
    setPicked((cur) => {
      const next = new Set(cur)
      const on = !cur.has(t.id)
      const a = lastPicked.current
        ? shown.findIndex((x) => x.id === lastPicked.current)
        : -1
      const b = shown.findIndex((x) => x.id === t.id)
      if (range && a >= 0 && b >= 0) {
        for (const x of shown.slice(Math.min(a, b), Math.max(a, b) + 1)) {
          if (on) next.add(x.id)
          else next.delete(x.id)
        }
      } else if (on) next.add(t.id)
      else next.delete(t.id)
      return next
    })
    lastPicked.current = t.id
  }

  async function recategorize(value: string) {
    setApplying(true)
    try {
      const ok = await bulkRecategorize([...picked], value)
      if (ok) setPicked(new Set())
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setApplying(false)
    }
  }

  async function retag(value: string) {
    setApplying(true)
    try {
      await bulkRetag([...picked], value)
      setPicked(new Set())
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setApplying(false)
    }
  }

  useIntent(
    "tx",
    (id) => {
      const t = transactions.find((x) => x.id === id)
      if (t) setSelected(t)
    },
    !!txq.data
  )

  function exportCsv() {
    const byId = new Map(accounts.map((a) => [a.id, a]))
    downloadCsv("transactions.csv", [
      [
        "Date",
        "Account",
        "Merchant",
        "Description",
        "Category",
        "Tax tag",
        "Amount",
        "Currency",
        "Pending",
        "Note",
      ],
      ...filtered.map((t) => [
        t.date,
        byId.get(t.accountId)?.name,
        t.merchant,
        t.description,
        CATEGORY_META[t.category].label,
        t.taxTag ? TAX_TAG_META[t.taxTag].label : "",
        t.amount.toFixed(2),
        byId.get(t.accountId)?.currency,
        t.pending ? "yes" : "",
        t.note,
      ]),
    ])
  }

  useIntent("export", () => exportCsv(), !!txq.data && !!overview.data)

  const loading = !txq.data || !overview.data

  function clearFilters() {
    setQuery("")
    setAccountId("all")
    setCategory("all")
    setFlow("all")
    setTag("all")
    void setLinks(null)
    changed()
  }

  return {
    overview,
    txq,
    converter,
    query,
    setQuery,
    accountId,
    setAccountId,
    category,
    setCategory,
    flow,
    setFlow,
    period,
    setPeriod,
    tag,
    setTag,
    links,
    setLinks,
    since,
    limit,
    setLimit,
    selected,
    setSelected,
    picked,
    setPicked,
    applying,
    accounts,
    transactions,
    accountItems,
    filtered,
    totals,
    shown,
    allShownPicked,
    filtersOn,
    merchantNames,
    periodOptions,
    changed,
    toggle,
    recategorize,
    retag,
    exportCsv,
    loading,
    clearFilters,
    transactionCategoryItems,
    transactionTagItems,
  }
}
