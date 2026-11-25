import {
  QueryClient,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query"
import {
  ApiError,
  api,
  DATA_CHANGED,
  TRANSACTION_UPDATED,
  type Transaction,
} from "@/lib/api"
import { addDays, isoDate } from "@/lib/format"

/**
 * One shared cache for all server data. Pages and the nav ask for the same keys, so a page load
 * makes each request once (also under StrictMode's double mount), and switching pages reuses
 * fresh data instead of refetching it.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      // Auth/validation errors won't fix themselves; network blips might.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
})

/**
 * Which cached data a write to an API path can change. Anything not listed (connecting a bank,
 * uploading statements, or a change with no path) refetches everything.
 */
const AFFECTS: [RegExp, readonly string[]][] = [
  // Categories and notes show in every transaction list, the charts built on them, and the
  // subscriptions matched to a merchant.
  [
    /^\/transactions\/merchant$/,
    ["transactions", "account", "subscriptions", "budgets"],
  ],
  // A single row is patched into the cached lists (below); only what's worked out on the server reloads.
  [/^\/transactions/, ["subscriptions", "budgets"]],
  [/^\/subscriptions/, ["subscriptions"]],
  [/^\/goals/, ["goals"]],
  [/^\/advice/, ["advice"]],
  [/^\/budgets/, ["budgets"]],
  // A bill and the invoice made from it share their payments.
  [/^\/work/, ["work", "invoices"]],
  [/^\/(invoices|invoice-profile|payment-methods)/, ["invoices", "work"]],
  [/^\/contacts/, ["contacts", "shares", "goals", "subscriptions", "work"]],
  [/^\/shares/, ["shares", "goals", "subscriptions", "work"]],
  // Instant updates and forgetting a password only change the connection itself.
  [
    /^\/connections\/[^/]+\/(instant-updates|forget-credentials)/,
    ["overview", "invoices"],
  ],
]

export function keysAffectedBy(
  path: string | undefined
): readonly string[] | null {
  if (!path) return null
  return AFFECTS.find(([re]) => re.test(path))?.[1] ?? null
}

/** Puts an edited transaction into every cached list that has it. */
export function patchCachedTransaction(tx: Transaction) {
  const swap = (list: Transaction[]) =>
    list.some((t) => t.id === tx.id)
      ? list.map((t) => (t.id === tx.id ? tx : t))
      : list
  queryClient.setQueriesData<{ transactions: Transaction[] }>(
    { queryKey: ["transactions"] },
    (d) => (d ? { ...d, transactions: swap(d.transactions) } : d)
  )
  queryClient.setQueriesData<{ transactions: Transaction[] }>(
    { queryKey: ["account"] },
    (d) =>
      d && Array.isArray(d.transactions)
        ? { ...d, transactions: swap(d.transactions) }
        : d
  )
}

// After a successful write, refetch what it could have changed (everything when unsure).
if (typeof window !== "undefined") {
  window.addEventListener(DATA_CHANGED, (e) => {
    const keys = keysAffectedBy((e as CustomEvent<string | undefined>).detail)
    if (!keys) return void queryClient.invalidateQueries()
    void queryClient.invalidateQueries({
      predicate: (q) => keys.includes(String(q.queryKey[0])),
    })
  })
  window.addEventListener(TRANSACTION_UPDATED, (e) =>
    patchCachedTransaction((e as CustomEvent<Transaction>).detail)
  )
}

export const queryKeys = {
  overview: ["overview"] as const,
  subscriptions: ["subscriptions"] as const,
  goals: ["goals"] as const,
  work: ["work"] as const,
  invoices: ["invoices"] as const,
  contacts: ["contacts"] as const,
  budgets: ["budgets"] as const,
  transactions: (from: string | null) =>
    ["transactions", from ?? "all"] as const,
  account: (id: string) => ["account", id] as const,
  accountDetails: (id: string) => ["account", id, "details"] as const,
}

/** The `{ data, error, loading, reload }` shape pages use; `loading` is true while any fetch runs. */
function view<T>(q: UseQueryResult<T>) {
  return {
    data: q.data ?? null,
    error: q.error,
    loading: q.isFetching,
    reload: async () => {
      await q.refetch()
    },
  }
}

export const useOverview = () =>
  view(useQuery({ queryKey: queryKeys.overview, queryFn: api.overview }))

export const useSubscriptions = () =>
  view(
    useQuery({ queryKey: queryKeys.subscriptions, queryFn: api.subscriptions })
  )

export const useGoals = () =>
  view(useQuery({ queryKey: queryKeys.goals, queryFn: api.goals }))
export const useWork = () =>
  view(useQuery({ queryKey: queryKeys.work, queryFn: api.work }))
export const useContacts = () =>
  view(useQuery({ queryKey: queryKeys.contacts, queryFn: api.contacts }))
export const useInvoices = () =>
  view(useQuery({ queryKey: queryKeys.invoices, queryFn: api.invoices }))
export const useBudgets = () =>
  view(useQuery({ queryKey: queryKeys.budgets, queryFn: api.budgets }))

/** Dashboard window: enough history for every chart range (the 1-year view plus a month of slack). */
export const DASHBOARD_FROM_DAYS = 400

export function useTransactions(from: string | null) {
  return view(
    useQuery({
      queryKey: queryKeys.transactions(from),
      queryFn: () => api.transactions(from ?? undefined),
    })
  )
}

export const useDashboardTransactions = () =>
  useTransactions(addDays(isoDate(), -DASHBOARD_FROM_DAYS))

export const useAccount = (id: string) =>
  view(
    useQuery({
      queryKey: queryKeys.account(id),
      queryFn: () => api.account(id),
    })
  )

/** Direct deposit numbers: fetched only when asked for, and never kept around. */
export const useAccountDetails = (id: string, enabled: boolean) =>
  view(
    useQuery({
      queryKey: queryKeys.accountDetails(id),
      queryFn: () => api.accountDetails(id),
      enabled,
      staleTime: 0,
      gcTime: 0,
    })
  )

/** Public server settings (no sign-in needed). */
export const useAppConfig = () =>
  useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const res = await fetch("/api/config")
      if (!res.ok) throw new Error("Could not reach the server")
      return (await res.json()) as { registrationOpen: boolean }
    },
    staleTime: 5 * 60_000,
  }).data ?? null
