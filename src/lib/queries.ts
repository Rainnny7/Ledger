import { QueryClient, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { ApiError, api, DATA_CHANGED } from '@/lib/api'
import { addDays, isoDate } from '@/lib/format'

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
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
})

// Any successful write (sync, category change, subscription edit…) can affect every view.
if (typeof window !== 'undefined') {
  window.addEventListener(DATA_CHANGED, () => void queryClient.invalidateQueries())
}

export const queryKeys = {
  overview: ['overview'] as const,
  subscriptions: ['subscriptions'] as const,
  goals: ['goals'] as const,
  work: ['work'] as const,
  invoices: ['invoices'] as const,
  transactions: (from: string | null) => ['transactions', from ?? 'all'] as const,
  account: (id: string) => ['account', id] as const,
  accountDetails: (id: string) => ['account', id, 'details'] as const,
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

export const useOverview = () => view(useQuery({ queryKey: queryKeys.overview, queryFn: api.overview }))

export const useSubscriptions = () => view(useQuery({ queryKey: queryKeys.subscriptions, queryFn: api.subscriptions }))

export const useGoals = () => view(useQuery({ queryKey: queryKeys.goals, queryFn: api.goals }))
export const useWork = () => view(useQuery({ queryKey: queryKeys.work, queryFn: api.work }))
export const useInvoices = () => view(useQuery({ queryKey: queryKeys.invoices, queryFn: api.invoices }))

/** Dashboard window: enough history for every chart range (the 1-year view plus a month of slack). */
export const DASHBOARD_FROM_DAYS = 400

export function useTransactions(from: string | null) {
  return view(useQuery({ queryKey: queryKeys.transactions(from), queryFn: () => api.transactions(from ?? undefined) }))
}

export const useDashboardTransactions = () => useTransactions(addDays(isoDate(), -DASHBOARD_FROM_DAYS))

export const useAccount = (id: string) =>
  view(useQuery({ queryKey: queryKeys.account(id), queryFn: () => api.account(id) }))

/** Direct deposit numbers: fetched only when asked for, and never kept around. */
export const useAccountDetails = (id: string, enabled: boolean) =>
  view(
    useQuery({
      queryKey: queryKeys.accountDetails(id),
      queryFn: () => api.accountDetails(id),
      enabled,
      staleTime: 0,
      gcTime: 0,
    }),
  )

/** Public server settings (no sign-in needed). */
export const useAppConfig = () =>
  useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await fetch('/api/config')
      if (!res.ok) throw new Error('Could not reach the server')
      return (await res.json()) as { registrationOpen: boolean }
    },
    staleTime: 5 * 60_000,
  }).data ?? null
