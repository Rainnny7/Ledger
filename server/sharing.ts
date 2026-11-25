import { db } from './db.ts'

/**
 * Sharing a goal, subscription or job with another account. The owner keeps it; people it's shared
 * with see it in their own lists ("view") and can also update it ("edit"). Deleting, archiving and
 * changing who it's shared with stay with the owner.
 */
export const SHARE_KINDS = ['goal', 'subscription', 'job'] as const
export type ShareKind = (typeof SHARE_KINDS)[number]
export const PERMISSIONS = ['view', 'edit'] as const
export type Permission = (typeof PERMISSIONS)[number]
export type Role = 'owner' | Permission

const TABLE: Record<ShareKind, string> = { goal: 'goal', subscription: 'subscription', job: 'work_job' }

export const isShareKind = (k: string): k is ShareKind => (SHARE_KINDS as readonly string[]).includes(k)

export interface Access {
  ownerId: string
  role: Role
}

/** What `userId` may do with an item: null when it doesn't exist or isn't theirs or shared with them. */
export function access(userId: string, kind: ShareKind, itemId: string): Access | null {
  const row = db.prepare(`SELECT user_id AS ownerId FROM ${TABLE[kind]} WHERE id = ?`).get(itemId) as { ownerId: string } | undefined
  if (!row) return null
  if (row.ownerId === userId) return { ownerId: row.ownerId, role: 'owner' }
  const share = db
    .prepare(`SELECT permission FROM share WHERE kind = ? AND item_id = ? AND recipient_id = ?`)
    .get(kind, itemId, userId) as { permission: Permission } | undefined
  return share ? { ownerId: row.ownerId, role: share.permission } : null
}

export const canEdit = (a: Access | null): a is Access => !!a && a.role !== 'view'

export interface ShareRow {
  id: string
  email: string
  /** Your contact name for them, if you've given one. */
  name: string | null
  permission: Permission
}

export interface Sharing {
  /** What you can do with it. */
  access: Role
  /** Who owns it, when that isn't you. */
  owner: { name: string; email: string } | null
  /** Who you've shared it with (only filled in for your own items). */
  sharedWith: ShareRow[]
}

/** Everyone `ownerId` has shared their items of this kind with, by item. */
function sharesByItem(ownerId: string, kind: ShareKind) {
  const rows = db
    .prepare(
      `SELECT s.id, s.item_id AS itemId, u.email, c.name, s.permission
         FROM share s JOIN user u ON u.id = s.recipient_id
         LEFT JOIN contact c ON c.user_id = s.owner_id AND c.email = lower(u.email)
        WHERE s.owner_id = ? AND s.kind = ? ORDER BY s.created_at`,
    )
    .all(ownerId, kind) as unknown as (ShareRow & { itemId: string })[]
  const map = new Map<string, ShareRow[]>()
  for (const { itemId, ...r } of rows) map.set(itemId, [...(map.get(itemId) ?? []), r])
  return map
}

function ownerOf(ownerId: string) {
  return (db.prepare(`SELECT name, email FROM user WHERE id = ?`).get(ownerId) as { name: string; email: string } | undefined) ?? {
    name: 'Someone',
    email: '',
  }
}

/**
 * Your own items (with who they're shared with) followed by the ones shared with you.
 * `loadOwn(ownerId)` lists an owner's items; `loadOne(ownerId, id)` loads one of them.
 */
export function listWithShared<T extends { id: string }>(
  kind: ShareKind,
  userId: string,
  loadOwn: (ownerId: string) => T[],
  loadOne: (ownerId: string, id: string) => T | undefined,
): (T & Sharing)[] {
  const shares = sharesByItem(userId, kind)
  const own = loadOwn(userId).map((item) => ({ ...item, access: 'owner' as Role, owner: null, sharedWith: shares.get(item.id) ?? [] }))
  const incoming = db
    .prepare(`SELECT item_id AS itemId, owner_id AS ownerId, permission FROM share WHERE recipient_id = ? AND kind = ? ORDER BY created_at`)
    .all(userId, kind) as { itemId: string; ownerId: string; permission: Permission }[]
  const owners = new Map<string, Sharing['owner']>()
  const shared: (T & Sharing)[] = []
  for (const s of incoming) {
    const item = loadOne(s.ownerId, s.itemId)
    if (!item) continue
    if (!owners.has(s.ownerId)) owners.set(s.ownerId, ownerOf(s.ownerId))
    shared.push({ ...item, access: s.permission, owner: owners.get(s.ownerId)!, sharedWith: [] })
  }
  return [...own, ...shared]
}

/** One item as `userId` sees it, or undefined when they can't. */
export function viewOne<T extends { id: string }>(
  kind: ShareKind,
  userId: string,
  id: string,
  loadOne: (ownerId: string, id: string) => T | undefined,
): (T & Sharing) | undefined {
  const a = access(userId, kind, id)
  if (!a) return undefined
  const item = loadOne(a.ownerId, id)
  if (!item) return undefined
  return a.role === 'owner'
    ? { ...item, access: 'owner', owner: null, sharedWith: sharesByItem(userId, kind).get(id) ?? [] }
    : { ...item, access: a.role, owner: ownerOf(a.ownerId), sharedWith: [] }
}

/** Drops every share of an item (when it's deleted). */
export function forgetItem(kind: ShareKind, itemId: string) {
  db.prepare(`DELETE FROM share WHERE kind = ? AND item_id = ?`).run(kind, itemId)
}
