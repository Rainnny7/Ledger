import { and, asc, eq, sql } from "drizzle-orm"
import { db } from "../db/connection.ts"
import {
	contact,
	goal,
	share,
	subscription,
	user,
	workJob,
} from "../db/schema/index.ts"

/**
 * Sharing a goal, subscription or job with another account. The owner keeps it; people it's shared
 * with see it in their own lists ("view") and can also update it ("edit"), once they accept the
 * invitation. Deleting (the item, or its bills, shifts and payments), archiving, linking bank
 * transactions and changing who it's shared with stay with the owner.
 */
export const SHARE_KINDS = ["goal", "subscription", "job"] as const
/** ShareKind values accepted by validation and routes. */
export type ShareKind = (typeof SHARE_KINDS)[number]
/** Public export for routes and tests. */
export const PERMISSIONS = ["view", "edit"] as const
/** Permission values accepted by validation and routes. */
export type Permission = (typeof PERMISSIONS)[number]
/** Role values accepted by validation and routes. */
export type Role = "owner" | Permission
/** ShareStatus values accepted by validation and routes. */
export type ShareStatus = "pending" | "accepted"

/** Table holding each kind of shareable item (all have `id`, `userId` and `name`). */
const ITEM_TABLE = {
	goal,
	subscription,
	job: workJob,
} as const

/** Type guard for share invitation kinds. */
export const isShareKind = (kind: string): kind is ShareKind =>
	(SHARE_KINDS as readonly string[]).includes(kind)

/** Shape of Access as stored and returned by the API. */
export interface Access {
	ownerId: string
	role: Role
}

/** What `userId` may do with an item: null when it doesn't exist or isn't theirs or shared with them. */
export function access(
	userId: string,
	kind: ShareKind,
	itemId: string
): Access | null {
	const itemTable = ITEM_TABLE[kind]
	const row = db
		.select({ ownerId: itemTable.userId })
		.from(itemTable)
		.where(eq(itemTable.id, itemId))
		.get()
	if (!row) {
		return null
	}
	if (row.ownerId === userId) {
		return { ownerId: row.ownerId, role: "owner" }
	}
	const grant = db
		.select({ permission: share.permission })
		.from(share)
		.where(
			and(
				eq(share.kind, kind),
				eq(share.itemId, itemId),
				eq(share.recipientId, userId),
				eq(share.status, "accepted")
			)
		)
		.get()
	return grant
		? { ownerId: row.ownerId, role: grant.permission as Permission }
		: null
}

/** Whether an access grant allows editing shared data. */
export const canEdit = (a: Access | null): a is Access =>
	!!a && a.role !== "view"

/** Shape of ShareRow as stored and returned by the API. */
export interface ShareRow {
	id: string
	email: string
	/** Your contact name for them, if you've given one. */
	name: string | null
	permission: Permission
	status: ShareStatus
}

/** Shape of Sharing as stored and returned by the API. */
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
		.select({
			id: share.id,
			itemId: share.itemId,
			email: user.email,
			name: contact.name,
			permission: share.permission,
			status: share.status,
		})
		.from(share)
		.innerJoin(user, eq(user.id, share.recipientId))
		.leftJoin(
			contact,
			and(
				eq(contact.userId, share.ownerId),
				eq(contact.email, sql`lower(${user.email})`)
			)
		)
		.where(and(eq(share.ownerId, ownerId), eq(share.kind, kind)))
		.orderBy(asc(share.createdAt))
		.all() as (ShareRow & { itemId: string })[]
	const map = new Map<string, ShareRow[]>()
	for (const { itemId, ...r } of rows) {
		map.set(itemId, [...(map.get(itemId) ?? []), r])
	}
	return map
}

/** Synthetic owner access row for a user id. */
export function ownerOf(ownerId: string) {
	return (
		db
			.select({ name: user.name, email: user.email })
			.from(user)
			.where(eq(user.id, ownerId))
			.get() ?? { name: "Someone", email: "" }
	)
}

/**
 * Your own items (with who they're shared with) followed by the ones shared with you.
 * `loadOwn(ownerId)` lists an owner's items; `loadOne(ownerId, id)` loads one of them.
 */
export function listWithShared<T extends { id: string }>(
	kind: ShareKind,
	userId: string,
	loadOwn: (ownerId: string) => T[],
	loadOne: (ownerId: string, id: string) => T | undefined
): (T & Sharing)[] {
	const shares = sharesByItem(userId, kind)
	const own = loadOwn(userId).map((item) => ({
		...item,
		access: "owner" as Role,
		owner: null,
		sharedWith: shares.get(item.id) ?? [],
	}))
	const incoming = db
		.select({
			itemId: share.itemId,
			ownerId: share.ownerId,
			permission: share.permission,
		})
		.from(share)
		.where(
			and(
				eq(share.recipientId, userId),
				eq(share.kind, kind),
				eq(share.status, "accepted")
			)
		)
		.orderBy(asc(share.createdAt))
		.all() as { itemId: string; ownerId: string; permission: Permission }[]
	const owners = new Map<string, Sharing["owner"]>()
	const shared: (T & Sharing)[] = []
	for (const incomingShare of incoming) {
		const item = loadOne(incomingShare.ownerId, incomingShare.itemId)
		if (!item) {
			continue
		}
		if (!owners.has(incomingShare.ownerId)) {
			owners.set(incomingShare.ownerId, ownerOf(incomingShare.ownerId))
		}
		shared.push({
			...item,
			access: incomingShare.permission,
			owner: owners.get(incomingShare.ownerId)!,
			sharedWith: [],
		})
	}
	return [...own, ...shared]
}

/** One item as `userId` sees it, or undefined when they can't. */
export function viewOne<T extends { id: string }>(
	kind: ShareKind,
	userId: string,
	id: string,
	loadOne: (ownerId: string, id: string) => T | undefined
): (T & Sharing) | undefined {
	const userAccess = access(userId, kind, id)
	if (!userAccess) {
		return undefined
	}
	const item = loadOne(userAccess.ownerId, id)
	if (!item) {
		return undefined
	}
	return userAccess.role === "owner"
		? {
				...item,
				access: "owner",
				owner: null,
				sharedWith: sharesByItem(userId, kind).get(id) ?? [],
			}
		: {
				...item,
				access: userAccess.role,
				owner: ownerOf(userAccess.ownerId),
				sharedWith: [],
			}
}

/** The name of an item, whoever owns it. */
export function itemName(kind: ShareKind, itemId: string) {
	const itemTable = ITEM_TABLE[kind]
	const row = db
		.select({ name: itemTable.name })
		.from(itemTable)
		.where(eq(itemTable.id, itemId))
		.get()
	return row?.name ?? null
}

/** Whether this access is the owner's (an item merely shared with you doesn't count). */
export const isOwner = (a: Access | null): a is Access => a?.role === "owner"

/** Drops every share of an item (when it's deleted). */
export function forgetItem(kind: ShareKind, itemId: string) {
	db.delete(share)
		.where(and(eq(share.kind, kind), eq(share.itemId, itemId)))
		.run()
}
