/** Calls to the admin API, shared by the Admin page's cards. */

export const auditKey = ['admin', 'audit'] as const
export const tasksKey = ['admin', 'tasks'] as const
export const backupsKey = ['admin', 'backups'] as const

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed')
  return data as T
}
