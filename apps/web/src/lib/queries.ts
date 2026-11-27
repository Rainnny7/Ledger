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
import { demoMode, demoPersona } from "@/lib/demo"
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
	notificationPreferences: ["notifications", "preferences"] as const,
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
	source: string | null
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
		headers: {
			"Content-Type": "application/json",
			...(demoMode ? { "X-Ledger-Demo": demoPersona.id } : {}),
			...init?.headers,
		},
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

function notificationsNow() {
	return new Date().toISOString()
}

function demoNotificationsOk() {
	return Promise.resolve({ ok: true as const })
}

function patchNotifications(
	patch: (data: NotificationsData) => NotificationsData
) {
	const previous = queryClient.getQueryData<NotificationsData>(
		queryKeys.notifications
	)
	if (previous) {
		queryClient.setQueryData(queryKeys.notifications, patch(previous))
	}
	return previous
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
	/** Whether the server can send login, verify, and delete confirmation links. */
	emailLinks: boolean
	/** Whether the monthly spending digest can be turned on (outgoing email and AI are both set up). */
	spendingDigest: boolean
}

/** Whether the signed-in user has a credential password (passwordless magic-link accounts do not). */
export const useHasPassword = (enabled = true) =>
	useQuery({
		queryKey: ["auth", "has-password"],
		queryFn: async () => {
			const response = await fetch("/api/auth/password/status", {
				credentials: "include",
			})
			if (!response.ok) {
				throw new Error("Could not load account details")
			}
			return (await response.json()) as { hasPassword: boolean }
		},
		enabled,
		staleTime: 5 * 60_000,
	})

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
			refetchInterval: demoMode ? false : 30_000,
			refetchOnWindowFocus: true,
		})
	)

/** Marks one notification as read. */
export const useMarkNotificationRead = () =>
	useMutation({
		mutationFn: (id: string) =>
			demoMode
				? demoNotificationsOk()
				: notificationsRequest<{ ok: true }>(`/${id}/read`, {
						method: "POST",
					}),
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.notifications })
			const previous = patchNotifications((data) => {
				const readAt = notificationsNow()
				let touchedUnread = false
				const items = data.items.map((item) => {
					if (item.id !== id || item.readAt) {
						return item
					}
					touchedUnread = true
					return { ...item, readAt }
				})
				return {
					items,
					unreadCount: Math.max(
						0,
						data.unreadCount - (touchedUnread ? 1 : 0)
					),
				}
			})
			return { previous }
		},
		onError: (_error, _id, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					queryKeys.notifications,
					context.previous
				)
			}
		},
		onSettled: () => {
			if (!demoMode) {
				void invalidateNotifications()
			}
		},
	})

/** Marks one notification as unread. */
export const useMarkNotificationUnread = () =>
	useMutation({
		mutationFn: (id: string) =>
			demoMode
				? demoNotificationsOk()
				: notificationsRequest<{ ok: true }>(`/${id}/unread`, {
						method: "POST",
					}),
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.notifications })
			const previous = patchNotifications((data) => {
				let touchedRead = false
				const items = data.items.map((item) => {
					if (item.id !== id || !item.readAt) {
						return item
					}
					touchedRead = true
					return { ...item, readAt: null }
				})
				return {
					items,
					unreadCount: data.unreadCount + (touchedRead ? 1 : 0),
				}
			})
			return { previous }
		},
		onError: (_error, _id, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					queryKeys.notifications,
					context.previous
				)
			}
		},
		onSettled: () => {
			if (!demoMode) {
				void invalidateNotifications()
			}
		},
	})

/** Marks every notification as read. */
export const useMarkAllNotificationsRead = () =>
	useMutation({
		mutationFn: () =>
			demoMode
				? demoNotificationsOk()
				: notificationsRequest<{ ok: true }>("/read-all", {
						method: "POST",
					}),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: queryKeys.notifications })
			const previous = patchNotifications((data) => {
				const readAt = notificationsNow()
				return {
					items: data.items.map((item) =>
						item.readAt ? item : { ...item, readAt }
					),
					unreadCount: 0,
				}
			})
			return { previous }
		},
		onError: (_error, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					queryKeys.notifications,
					context.previous
				)
			}
		},
		onSettled: () => {
			if (!demoMode) {
				void invalidateNotifications()
			}
		},
	})

/** Removes one notification. */
export const useDeleteNotification = () =>
	useMutation({
		mutationFn: (id: string) =>
			demoMode
				? demoNotificationsOk()
				: notificationsRequest<{ ok: true }>(`/${id}`, {
						method: "DELETE",
					}),
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.notifications })
			const previous = patchNotifications((data) => {
				const removed = data.items.find((item) => item.id === id)
				return {
					items: data.items.filter((item) => item.id !== id),
					unreadCount: Math.max(
						0,
						data.unreadCount - (removed && !removed.readAt ? 1 : 0)
					),
				}
			})
			return { previous }
		},
		onError: (_error, _id, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					queryKeys.notifications,
					context.previous
				)
			}
		},
		onSettled: () => {
			if (!demoMode) {
				void invalidateNotifications()
			}
		},
	})

/** Removes every notification. */
export const useClearAllNotifications = () =>
	useMutation({
		mutationFn: () =>
			demoMode
				? demoNotificationsOk()
				: notificationsRequest<{ ok: true }>("", { method: "DELETE" }),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: queryKeys.notifications })
			const previous = queryClient.getQueryData<NotificationsData>(
				queryKeys.notifications
			)
			queryClient.setQueryData<NotificationsData>(queryKeys.notifications, {
				items: [],
				unreadCount: 0,
			})
			return { previous }
		},
		onError: (_error, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					queryKeys.notifications,
					context.previous
				)
			}
		},
		onSettled: () => {
			if (!demoMode) {
				void invalidateNotifications()
			}
		},
	})

/** Sources a user can route independently. */
export type NotificationSource = "security" | "digest"

/** Independent email and in-app toggles for one notification source. */
export type NotificationPreference = {
	email: boolean
	inApp: boolean
}

/** Delivery toggles per notification source. */
export type NotificationPreferences = Record<
	NotificationSource,
	NotificationPreference
>

/** Delivery preferences for each notification source. */
export const useNotificationPreferences = () =>
	view(
		useQuery({
			queryKey: queryKeys.notificationPreferences,
			queryFn: async () =>
				(
					await notificationsRequest<{
						preferences: NotificationPreferences
					}>("/preferences")
				).preferences,
		})
	)

/** Changes delivery toggles for one source, updating the cache optimistically. */
export const useSetNotificationPreference = () =>
	useMutation({
		mutationFn: (variables: {
			source: NotificationSource
			email: boolean
			inApp: boolean
		}) =>
			notificationsRequest<{ preferences: NotificationPreferences }>(
				"/preferences",
				{ method: "PUT", body: JSON.stringify(variables) }
			),
		onMutate: async ({ source, email, inApp }) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.notificationPreferences,
			})
			const previous = queryClient.getQueryData<NotificationPreferences>(
				queryKeys.notificationPreferences
			)
			if (previous) {
				queryClient.setQueryData<NotificationPreferences>(
					queryKeys.notificationPreferences,
					{ ...previous, [source]: { email, inApp } }
				)
			}
			return { previous }
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					queryKeys.notificationPreferences,
					context.previous
				)
			}
			toastError(error.message)
		},
		onSuccess: (data) =>
			queryClient.setQueryData(
				queryKeys.notificationPreferences,
				data.preferences
			),
	})
