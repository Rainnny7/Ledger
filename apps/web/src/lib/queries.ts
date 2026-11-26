import {
	keepPreviousData,
	QueryCache,
	QueryClient,
	useMutation,
	useQuery,
	type UseQueryResult,
} from "@tanstack/react-query"
import {
	ApiError,
	api,
	DATA_CHANGED,
	TRANSACTION_UPDATED,
	fetchAllTransactions,
	type Transaction,
} from "@/lib/api"
import { addDays, isoDate } from "@/lib/format"
import { type RangeKey, rangeStart } from "@/lib/ranges"
import { toastError } from "@/lib/toast"

/**
 * One shared cache for all server data. Pages and the nav ask for the same keys, so a page load
 * makes each request once (also under StrictMode's double mount), and switching pages reuses
 * fresh data instead of refetching it.
 */
export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			// A session that ended (logging out) sends the guards to the login page; that's not worth a toast.
			if (error instanceof ApiError && error.status === 401) {
				return
			}
			const message =
				error instanceof Error ? error.message : String(error)
			toastError(message, { id: JSON.stringify(query.queryKey) })
		},
	}),
	defaultOptions: {
		queries: {
			staleTime: 60_000,
			gcTime: 10 * 60_000,
			// Auth/validation errors won't fix themselves; network blips might.
			retry: (count, error) =>
				!(
					error instanceof ApiError &&
					error.status > 0 &&
					error.status < 500
				) && count < 2,
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
	[/^\/mcp-tokens/, ["mcp-tokens"]],
	// A bill and the invoice made from it share their payments.
	[/^\/work/, ["work", "invoices"]],
	[/^\/(invoices|invoice-profile|payment-methods)/, ["invoices", "work"]],
	[/^\/contacts/, ["contacts", "shares", "goals", "subscriptions", "work"]],
	[/^\/shares/, ["shares", "goals", "subscriptions", "work"]],
	[/^\/invites/, ["invites", "goals", "subscriptions", "work"]],
	// Instant updates and forgetting a password only change the connection itself.
	[
		/^\/connections\/[^/]+\/(instant-updates|forget-credentials)/,
		["overview", "invoices"],
	],
]

/** Query cache key prefixes invalidated when `path` is written to. */
export function keysAffectedBy(
	path: string | undefined
): readonly string[] | null {
	if (!path) {
		return null
	}
	return AFFECTS.find(([re]) => re.test(path))?.[1] ?? null
}

/** Puts an edited transaction into every cached list that has it. */
export function patchCachedTransaction(transaction: Transaction) {
	const swap = (list: Transaction[]) =>
		list.some((row) => row.id === transaction.id)
			? list.map((row) => (row.id === transaction.id ? transaction : row))
			: list
	queryClient.setQueriesData<{ transactions: Transaction[] }>(
		{ queryKey: ["transactions"] },
		(data) =>
			data && Array.isArray(data.transactions)
				? { ...data, transactions: swap(data.transactions) }
				: data
	)
	queryClient.setQueriesData<{ transactions: Transaction[] }>(
		{ queryKey: ["account"] },
		(data) =>
			data && Array.isArray(data.transactions)
				? { ...data, transactions: swap(data.transactions) }
				: data
	)
}

// After a successful write, refetch what it could have changed (everything when unsure).
if (typeof window !== "undefined") {
	window.addEventListener(DATA_CHANGED, (event) => {
		const keys = keysAffectedBy(
			(event as CustomEvent<string | undefined>).detail
		)
		if (!keys) {
			return void queryClient.invalidateQueries()
		}
		void queryClient.invalidateQueries({
			predicate: (query) => keys.includes(String(query.queryKey[0])),
		})
	})
	window.addEventListener(TRANSACTION_UPDATED, (event) =>
		patchCachedTransaction((event as CustomEvent<Transaction>).detail)
	)
}

/** Stable React Query key tuples used across the app. */
export const queryKeys = {
	overview: ["overview"] as const,
	subscriptions: ["subscriptions"] as const,
	goals: ["goals"] as const,
	work: ["work"] as const,
	invoices: ["invoices"] as const,
	contacts: ["contacts"] as const,
	invites: ["invites"] as const,
	budgets: ["budgets"] as const,
	mcpTokens: ["mcp-tokens"] as const,
	transactions: (from: string | null) =>
		["transactions", from ?? "all"] as const,
	account: (id: string) => ["account", id] as const,
	accountDetails: (id: string) => ["account", id, "details"] as const,
	update: ["admin", "update"] as const,
	notifications: ["notifications"] as const,
}

/** Notification severity shown in the bell and admin send form. */
export type NotificationKind = "info" | "success" | "warning" | "alert"

/** One in-app notification row from GET /api/notifications. */
export type NotificationItem = {
	id: string
	kind: NotificationKind
	title: string
	body: string
	href: string | null
	readAt: string | null
	createdAt: string
}

/** Response payload for GET /api/notifications. */
export type NotificationsData = {
	items: NotificationItem[]
	unreadCount: number
}

async function notificationsRequest<T>(
	path: string,
	init?: RequestInit
): Promise<T> {
	const response = await fetch(`/api/notifications${path}`, {
		...init,
		credentials: "include",
		headers: { "Content-Type": "application/json", ...init?.headers },
	})
	if (!response.ok) {
		const data = await response.json().catch(() => ({}))
		throw new ApiError(
			response.status,
			(data as { error?: string }).error ?? "Request failed"
		)
	}
	return (await response.json().catch(() => ({}))) as T
}

function invalidateNotifications() {
	return queryClient.invalidateQueries({
		queryKey: queryKeys.notifications,
	})
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

/** Accounts, balances, connections, and the bank list behind the dashboard. */
export const useOverview = () =>
	view(useQuery({ queryKey: queryKeys.overview, queryFn: api.overview }))

/** Your recurring charges, upcoming payments, and linked transactions. */
export const useSubscriptions = () =>
	view(
		useQuery({
			queryKey: queryKeys.subscriptions,
			queryFn: api.subscriptions,
		})
	)

/** Savings goals, progress, and linked payments. */
export const useGoals = () =>
	view(useQuery({ queryKey: queryKeys.goals, queryFn: api.goals }))
/** Freelance jobs, logged hours, bills, and payments. */
export const useWork = () =>
	view(useQuery({ queryKey: queryKeys.work, queryFn: api.work }))
/** People you share with and their contact details. */
export const useContacts = () =>
	view(useQuery({ queryKey: queryKeys.contacts, queryFn: api.contacts }))
/** Pending share invites (only fetched when the dialog is open). */
export const useInvites = (enabled: boolean) =>
	view(
		useQuery({ queryKey: queryKeys.invites, queryFn: api.invites, enabled })
	)
/** Invoices you've sent and payment methods on file. */
export const useInvoices = () =>
	view(useQuery({ queryKey: queryKeys.invoices, queryFn: api.invoices }))
/** The signed-in user's MCP API tokens (only fetched while the MCP card is shown). */
export const useMcpTokens = (enabled: boolean) =>
	view(
		useQuery({
			queryKey: queryKeys.mcpTokens,
			queryFn: api.mcpTokens,
			enabled,
		})
	)
/** Monthly category spending limits. */
export const useBudgets = () =>
	view(useQuery({ queryKey: queryKeys.budgets, queryFn: api.budgets }))

/** Dashboard base window: the 1-year view plus a month of slack; longer ranges widen it. */
export const DASHBOARD_FROM_DAYS = 400

/** Transaction rows from `from` onward, or every row when `from` is null. */
export function useTransactions(from: string | null) {
	return view(
		useQuery({
			queryKey: queryKeys.transactions(from),
			placeholderData: keepPreviousData,
			queryFn: async () =>
				from ? fetchAllTransactions({ from }) : fetchAllTransactions(),
		})
	)
}

/** The default window, widened to reach back as far as the selected chart range. */
export function useDashboardTransactions(range: RangeKey = "1y") {
	const base = addDays(isoDate(), -DASHBOARD_FROM_DAYS)
	const start = rangeStart(range)
	const from = range === "all" ? null : start && start < base ? start : base
	return useTransactions(from)
}

/** One account's balance, transactions, and connection status. */
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

/** Public server settings (no login needed). */
const UPDATE_STALE = 6 * 60 * 60_000

/** Whether a newer GitHub release is out (admins only; endpoint returns 403 otherwise). */
export const useUpdate = (enabled: boolean) =>
	useQuery({
		queryKey: queryKeys.update,
		queryFn: api.update,
		enabled,
		staleTime: UPDATE_STALE,
		refetchInterval: UPDATE_STALE,
		retry: false,
	})

/** Public settings from GET /api/config (no login required). */
export type AppConfig = {
	registrationOpen: boolean
	aiChat: boolean
	mcp: boolean
	/** Public Cloudflare Turnstile site key; null when captcha is off. */
	turnstileSiteKey: string | null
}

/** Whether open registration is enabled (from a public config endpoint). */
export const useAppConfig = () =>
	useQuery({
		queryKey: ["config"],
		queryFn: async () => {
			const response = await fetch("/api/config")
			if (!response.ok) {
				throw new Error("Could not reach the server")
			}
			return (await response.json()) as AppConfig
		},
		staleTime: 5 * 60_000,
	}).data ?? null

/** In-app notifications for the signed-in user (polls every 30s). */
export const useNotifications = (enabled = true) =>
	view(
		useQuery({
			queryKey: queryKeys.notifications,
			queryFn: () => notificationsRequest<NotificationsData>(""),
			enabled,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
		})
	)

/** Marks one notification as read. */
export const useMarkNotificationRead = () =>
	useMutation({
		mutationFn: (id: string) =>
			notificationsRequest<{ ok: true }>(`/${id}/read`, {
				method: "POST",
			}),
		onSuccess: () => void invalidateNotifications(),
	})

/** Marks every notification as read. */
export const useMarkAllNotificationsRead = () =>
	useMutation({
		mutationFn: () =>
			notificationsRequest<{ ok: true }>("/read-all", { method: "POST" }),
		onSuccess: () => void invalidateNotifications(),
	})

/** Removes one notification. */
export const useDeleteNotification = () =>
	useMutation({
		mutationFn: (id: string) =>
			notificationsRequest<{ ok: true }>(`/${id}`, { method: "DELETE" }),
		onSuccess: () => void invalidateNotifications(),
	})

/** Removes every notification. */
export const useClearAllNotifications = () =>
	useMutation({
		mutationFn: () =>
			notificationsRequest<{ ok: true }>("", { method: "DELETE" }),
		onSuccess: () => void invalidateNotifications(),
	})
