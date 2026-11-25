import { Elysia } from "elysia"
import { sessionUser } from "./session.ts"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { db } from "../db/connection.ts"
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

const CONTACT_COLS = `id, email, name, created_at AS createdAt`

const loadContacts = (userId: string) =>
	db
		.prepare(
			`SELECT ${CONTACT_COLS} FROM contact WHERE user_id = ? ORDER BY coalesce(name, email) COLLATE NOCASE`
		)
		.all(userId)

/** Adds someone to your contacts (keeps an existing name unless a new one is given). */
function saveContact(userId: string, address: string, label?: string | null) {
	db.prepare(
		`INSERT INTO contact (id, user_id, email, name) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, email) DO UPDATE SET name = coalesce(excluded.name, contact.name)`
	).run(randomUUID(), userId, address, label?.trim() || null)
	return db
		.prepare(
			`SELECT ${CONTACT_COLS} FROM contact WHERE user_id = ? AND email = ?`
		)
		.get(userId, address)
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
			.prepare(`UPDATE contact SET name = ? WHERE id = ? AND user_id = ?`)
			.run(body.name?.trim() || null, contactId, user.id)
		if (!result.changes) {
			return status(404, { error: "Not found" })
		}
		return {
			contact: db
				.prepare(`SELECT ${CONTACT_COLS} FROM contact WHERE id = ?`)
				.get(contactId),
		}
	},
	{ params: idParam, body: jsonBody(contactPatch) }
)

sharing.delete(
	"/contacts/:id",
	({ user, params, status }) => {
		const { id: contactId } = params
		const result = db
			.prepare(`DELETE FROM contact WHERE id = ? AND user_id = ?`)
			.run(contactId, user.id)
		return result.changes
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)

// ---------------------------------------------------------------- shares

function loadShares(ownerId: string, kind: string, itemId: string) {
	return db
		.prepare(
			`SELECT s.id, u.email, c.name, s.permission, s.status
         FROM share s JOIN user u ON u.id = s.recipient_id
         LEFT JOIN contact c ON c.user_id = s.owner_id AND c.email = lower(u.email)
        WHERE s.owner_id = ? AND s.kind = ? AND s.item_id = ? ORDER BY s.created_at`
		)
		.all(ownerId, kind, itemId) as unknown as ShareRow[]
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
			: (db
					.prepare(`SELECT id FROM user WHERE lower(email) = ?`)
					.get(to) as { id: string } | null)
		// The answer is the same whether or not an account uses that email, so this can't be used to
		// find out who is registered. An unknown address creates nothing: a pending invite for it would
		// hand the item to whoever signed up with that email first.
		if (recipient) {
			// Re-sharing only changes the permission; it never re-opens an accepted share as pending.
			db.prepare(
				`INSERT INTO share (id, owner_id, kind, item_id, recipient_id, permission) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (kind, item_id, recipient_id) DO UPDATE SET permission = excluded.permission`
			).run(
				randomUUID(),
				userId,
				kind,
				itemId,
				recipient.id,
				body.permission
			)
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
			.prepare(
				`UPDATE share SET permission = ? WHERE id = ? AND owner_id = ?`
			)
			.run(permission, shareId, user.id)
		return result.changes
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
			.prepare(
				`DELETE FROM share WHERE id = ? AND (owner_id = ? OR recipient_id = ?)`
			)
			.run(shareId, userId, userId)
		return result.changes
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
			.prepare(
				`DELETE FROM share WHERE kind = ? AND item_id = ? AND recipient_id = ?`
			)
			.run(kind, itemId, user.id)
		return result.changes
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
	const rows = db
		.prepare(
			`SELECT id, kind, item_id AS itemId, owner_id AS ownerId, permission
         FROM share WHERE recipient_id = ? AND status = 'pending' ORDER BY created_at`
		)
		.all(user.id) as unknown as InviteRow[]
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
			.prepare(
				`UPDATE share SET status = 'accepted' WHERE id = ? AND recipient_id = ? AND status = 'pending'`
			)
			.run(shareId, user.id)
		return result.changes
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
			.prepare(
				`DELETE FROM share WHERE id = ? AND recipient_id = ? AND status = 'pending'`
			)
			.run(shareId, user.id)
		return result.changes
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)
