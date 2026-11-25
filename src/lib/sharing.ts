import { toast } from 'sonner'
import { api, type Shared, type ShareKind } from '@/lib/api'

export const KIND_LABEL: Record<ShareKind, string> = { goal: 'goal', subscription: 'subscription', job: 'job' }

/** First name, else the part of the email before the @. */
export const shortName = (p: { name?: string | null; email: string }) => p.name?.trim().split(/\s+/)[0] || p.email.split('@')[0]

export const initials = (p: { name?: string | null; email: string }) => {
  const words = (p.name?.trim() || p.email).split(/[\s@._-]+/).filter(Boolean)
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase()
}

/** Stop seeing something someone shared with you. */
export async function leaveShared(kind: ShareKind, item: { id: string; name: string; owner: Shared['owner'] }) {
  if (!confirm(`Remove “${item.name}” from your ${KIND_LABEL[kind]}s? ${item.owner?.name || 'The owner'} can share it again.`)) return
  try {
    await api.leaveShare(kind, item.id)
    toast.success(`Removed ${item.name}`)
  } catch (err) {
    toast.error((err as Error).message)
  }
}

/** Your own items first, then the ones shared with you. */
export const splitShared = <T extends Shared>(items: T[]) => ({
  own: items.filter((i) => i.access === 'owner'),
  shared: items.filter((i) => i.access !== 'owner'),
})
