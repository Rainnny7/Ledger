/** Calls to the admin API, shared by the Admin page's cards. */

/** React Query key for admin audit log fetches. */
export const auditKey = ["admin", "audit"] as const
/** React Query key for admin background tasks. */
export const tasksKey = ["admin", "tasks"] as const
/** React Query key for admin backup list and restore. */
export const backupsKey = ["admin", "backups"] as const

/** Authenticated JSON fetch against `/api/admin/*` (throws on non-OK). */
export async function adminFetch<T>(
	path: string,
	init?: RequestInit
): Promise<T> {
	const response = await fetch(`/api/admin/${path}`, {
		...init,
		credentials: "include",
		headers: { "Content-Type": "application/json" },
	})
	if (!response.ok) {
		const data = await response.json().catch(() => ({}))
		throw new Error((data as { error?: string }).error ?? "Request failed")
	}
	return (await response.json().catch(() => ({}))) as T
}
