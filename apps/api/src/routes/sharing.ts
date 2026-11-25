import { Elysia } from "elysia"
import { sessionUser } from "./session.ts"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { and, asc, eq, or, sql } from "drizzle-orm"
import { db } from "../db/connection.ts"
import { contact, share, user as userTable } from "../db/schema/index.ts"
import { isDemoEmail } from "../demo/personas.ts"
import {
	access,
	isShareKind,
	itemName,
	ownerOf,
	PERMISSIONS,
	SHARE_KINDS,
	type ShareRow,
} from "../sharing/access.ts"
import { boundedString, id, jsonBody } from "../http/validation.ts"

/** Elysia plugin wiring HTTP handlers for this area. */
export const sharing = new Elysia({ name: "sharing" }).use(sessionUser)

const email = boundedString(254).trim().toLowerCase().email()
const name = boundedString(80).trim().nullable().optional()
const idParam = z.object({ id: id })
// The first segment is named `id` like /shares/:id: the router needs one parameter name per position.
const shareItemParam = z.object({
	id: z.enum(SHARE_KINDS),
	itemId: id,
})
const contactBody = z.object({ email, name })
const contactPatch = z.object({ name })
const sharePostBody = z.object({
	email,
	permission: z.enum(PERMISSIONS).default("view"),
})
const sharePatchBody = z.object({ permission: z.enum(PERMISSIONS) })

// ---------------------------------------------------------------- contacts

const contactColumns = {
	id: contact.id,
	email: contact.email,
	name: contact.name,
	createdAt: contact.createdAt,
}

const loadContacts = (userId: string) =>
	db
		.select(contactColumns)
		.from(contact)
		.where(eq(contact.userId, userId))
		.orderBy(
			sql`coalesce(${contact.name}, ${contact.email}) COLLATE NOCASE`
		)
		.all()

/** Adds someone to your contacts (keeps an existing name unless a new one is given). */
function saveContact(userId: string, address: string, label?: string | null) {
	db.insert(contact)
		.values({
			id: randomUUID(),
			userId,
			email: address,
			name: label?.trim() || null,
		})
		.onConflictDoUpdate({
			target: [contact.userId, contact.email],
			set: { name: sql`coalesce(excluded.name, ${contact.name})` },
		})
		.run()
	return db
		.select(contactColumns)
		.from(contact)
		.where(and(eq(contact.userId, userId), eq(contact.email, address)))
		.get()
}

sharing.get("/contacts", ({ user }) => ({ contacts: loadContacts(user.id) }))

sharing.post(
	"/contacts",
	({ user, body, status }) => {
		if (body.email === user.email.toLowerCase()) {
			return status(400, { error: "That’s your own email." })
		}
		if (isDemoEmail(body.email)) {
			return status(400, { error: "Enter a valid email address." })
		}
		return {
			contact: saveContact(user.id, body.email, body.name),
		}
	},
	{ body: jsonBody(contactBody) }
)

sharing.patch(
	"/contacts/:id",
	({ user, params, body, status }) => {
		const { id: contactId } = params
		const result = db
			.update(contact)
			.set({ name: body.name?.trim() || null })
			.where(and(eq(contact.id, contactId), eq(contact.userId, user.id)))
			.returning({ id: contact.id })
			.all()
		if (result.length === 0) {
			return status(404, { error: "Not found" })
		}
		return {
			contact: db
				.select(contactColumns)
				.from(contact)
				.where(eq(contact.id, contactId))
				.get(),
		}
	},
	{ params: idParam, body: jsonBody(contactPatch) }
)

sharing.delete(
	"/contacts/:id",
	({ user, params, status }) => {
		const { id: contactId } = params
		const result = db
			.delete(contact)
			.where(and(eq(contact.id, contactId), eq(contact.userId, user.id)))
			.returning({ id: contact.id })
			.all()
		return result.length
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)

// ---------------------------------------------------------------- shares

function loadShares(ownerId: string, kind: string, itemId: string) {
	return db
		.select({
			id: share.id,
			email: userTable.email,
			name: contact.name,
			permission: share.permission,
			status: share.status,
		})
		.from(share)
		.innerJoin(userTable, eq(userTable.id, share.recipientId))
		.leftJoin(
			contact,
			and(
				eq(contact.userId, share.ownerId),
				eq(contact.email, sql`lower(${userTable.email})`)
			)
		)
		.where(
			and(
				eq(share.ownerId, ownerId),
				eq(share.kind, kind),
				eq(share.itemId, itemId)
			)
		)
		.orderBy(asc(share.createdAt))
		.all() as ShareRow[]
}

/** The item behind /shares/:id/:itemId, when the caller owns it. */
function ownedItem(userId: string, kind: string, itemId: string) {
	if (!isShareKind(kind)) {
		return null
	}
	return access(userId, kind, itemId)?.role === "owner" ? kind : null
}

sharing.get(
	"/shares/:id/:itemId",
	({ user, params, status }) => {
		const { id: kind, itemId } = params
		if (!ownedItem(user.id, kind, itemId)) {
			return status(404, { error: "Not found" })
		}
		return { shares: loadShares(user.id, kind, itemId) }
	},
	{ params: shareItemParam }
)

sharing.post(
	"/shares/:id/:itemId",
	({ user, params, body, status }) => {
		const { id: kind, itemId } = params
		const userId = user.id
		if (!ownedItem(userId, kind, itemId)) {
			return status(404, { error: "Not found" })
		}
		const to = body.email
		if (to === user.email.toLowerCase()) {
			return status(400, { error: "That’s your own email." })
		}
		const recipient = isDemoEmail(to)
			? undefined
			: db
					.select({ id: userTable.id })
					.from(userTable)
					.where(sql`lower(${userTable.email}) = ${to}`)
					.get()
		// The answer is the same whether or not an account uses that email, so this can't be used to
		// find out who is registered. An unknown address creates nothing: a pending invite for it would
		// hand the item to whoever signed up with that email first.
		if (recipient) {
			// Re-sharing only changes the permission; it never re-opens an accepted share as pending.
			db.insert(share)
				.values({
					id: randomUUID(),
					ownerId: userId,
					kind,
					itemId,
					recipientId: recipient.id,
					permission: body.permission,
				})
				.onConflictDoUpdate({
					target: [share.kind, share.itemId, share.recipientId],
					set: { permission: sql`excluded.permission` },
				})
				.run()
		}
		saveContact(userId, to)
		return { ok: true }
	},
	{ params: shareItemParam, body: jsonBody(sharePostBody) }
)

sharing.patch(
	"/shares/:id",
	({ user, params, body, status }) => {
		const { permission } = body
		const { id: shareId } = params
		const result = db
			.update(share)
			.set({ permission })
			.where(and(eq(share.id, shareId), eq(share.ownerId, user.id)))
			.returning({ id: share.id })
			.all()
		return result.length
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam, body: jsonBody(sharePatchBody) }
)

sharing.delete(
	"/shares/:id",
	({ user, params, status }) => {
		const userId = user.id
		const { id: shareId } = params
		const result = db
			.delete(share)
			.where(
				and(
					eq(share.id, shareId),
					or(eq(share.ownerId, userId), eq(share.recipientId, userId))
				)
			)
			.returning({ id: share.id })
			.all()
		return result.length
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)

sharing.delete(
	"/shares/:id/:itemId/me",
	({ user, params, status }) => {
		const { id: kind, itemId } = params
		const result = db
			.delete(share)
			.where(
				and(
					eq(share.kind, kind),
					eq(share.itemId, itemId),
					eq(share.recipientId, user.id)
				)
			)
			.returning({ id: share.id })
			.all()
		return result.length
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: shareItemParam }
)

// ---------------------------------------------------------------- invitations (recipient side)

interface InviteRow {
	id: string
	kind: string
	itemId: string
	ownerId: string
	permission: string
}

/** Invitations waiting for the signed-in user, with who is sharing what so they can judge it. */
sharing.get("/invites", ({ user }) => {
	const rows: InviteRow[] = db
		.select({
			id: share.id,
			kind: share.kind,
			itemId: share.itemId,
			ownerId: share.ownerId,
			permission: share.permission,
		})
		.from(share)
		.where(and(eq(share.recipientId, user.id), eq(share.status, "pending")))
		.orderBy(asc(share.createdAt))
		.all()
	const invites = rows.flatMap((row) => {
		if (!isShareKind(row.kind)) {
			return []
		}
		const item = itemName(row.kind, row.itemId)
		if (item === null) {
			return []
		}
		return [
			{
				id: row.id,
				kind: row.kind,
				name: item,
				permission: row.permission,
				owner: ownerOf(row.ownerId),
			},
		]
	})
	return { invites }
})

sharing.post(
	"/invites/:id/accept",
	({ user, params, status }) => {
		const { id: shareId } = params
		const result = db
			.update(share)
			.set({ status: "accepted" })
			.where(
				and(
					eq(share.id, shareId),
					eq(share.recipientId, user.id),
					eq(share.status, "pending")
				)
			)
			.returning({ id: share.id })
			.all()
		return result.length
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)

sharing.post(
	"/invites/:id/decline",
	({ user, params, status }) => {
		const { id: shareId } = params
		const result = db
			.delete(share)
			.where(
				and(
					eq(share.id, shareId),
					eq(share.recipientId, user.id),
					eq(share.status, "pending")
				)
			)
			.returning({ id: share.id })
			.all()
		return result.length
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)
