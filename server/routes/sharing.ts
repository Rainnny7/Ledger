import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { z } from "zod"
import type { auth } from "../auth/index.ts"
import { db } from "../db.ts"
import { isDemoEmail } from "../demo/personas.ts"
import {
  access,
  isShareKind,
  itemName,
  ownerOf,
  PERMISSIONS,
  SHARE_KINDS,
  type ShareRow,
} from "../sharing.ts"
import { boundedString, id, validate } from "../validation.ts"

type Vars = { Variables: { user: typeof auth.$Infer.Session.user } }
export const sharing = new Hono<Vars>()

const email = boundedString(254).trim().toLowerCase().email()
const name = boundedString(80).trim().nullable().optional()
const idParam = z.object({ id: id })
const shareItemParam = z.object({
  kind: z.enum(SHARE_KINDS),
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

sharing.get("/contacts", (c) =>
  c.json({ contacts: loadContacts(c.var.user.id) })
)

sharing.post("/contacts", validate("json", contactBody), (c) => {
  const body = c.req.valid("json")
  if (body.email === c.var.user.email.toLowerCase())
    return c.json({ error: "That’s your own email." }, 400)
  if (isDemoEmail(body.email))
    return c.json({ error: "Enter a valid email address." }, 400)
  return c.json({
    contact: saveContact(c.var.user.id, body.email, body.name),
  })
})

sharing.patch(
  "/contacts/:id",
  validate("param", idParam),
  validate("json", contactPatch),
  (c) => {
    const body = c.req.valid("json")
    const { id: contactId } = c.req.valid("param")
    const r = db
      .prepare(`UPDATE contact SET name = ? WHERE id = ? AND user_id = ?`)
      .run(body.name?.trim() || null, contactId, c.var.user.id)
    if (!r.changes) return c.json({ error: "Not found" }, 404)
    return c.json({
      contact: db
        .prepare(`SELECT ${CONTACT_COLS} FROM contact WHERE id = ?`)
        .get(contactId),
    })
  }
)

sharing.delete("/contacts/:id", validate("param", idParam), (c) => {
  const { id: contactId } = c.req.valid("param")
  const r = db
    .prepare(`DELETE FROM contact WHERE id = ? AND user_id = ?`)
    .run(contactId, c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

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

/** The item behind /shares/:kind/:itemId, when the caller owns it. */
function ownedItem(userId: string, kind: string, itemId: string) {
  if (!isShareKind(kind)) return null
  return access(userId, kind, itemId)?.role === "owner" ? kind : null
}

sharing.get("/shares/:kind/:itemId", validate("param", shareItemParam), (c) => {
  const { kind, itemId } = c.req.valid("param")
  if (!ownedItem(c.var.user.id, kind, itemId))
    return c.json({ error: "Not found" }, 404)
  return c.json({ shares: loadShares(c.var.user.id, kind, itemId) })
})

sharing.post(
  "/shares/:kind/:itemId",
  validate("param", shareItemParam),
  validate("json", sharePostBody),
  (c) => {
    const body = c.req.valid("json")
    const { kind, itemId } = c.req.valid("param")
    const userId = c.var.user.id
    if (!ownedItem(userId, kind, itemId))
      return c.json({ error: "Not found" }, 404)
    const to = body.email
    if (to === c.var.user.email.toLowerCase())
      return c.json({ error: "That’s your own email." }, 400)
    const recipient = isDemoEmail(to)
      ? undefined
      : (db.prepare(`SELECT id FROM user WHERE lower(email) = ?`).get(to) as
          | { id: string }
          | undefined)
    // The answer is the same whether or not an account uses that email, so this can't be used to
    // find out who is registered. An unknown address creates nothing: a pending invite for it would
    // hand the item to whoever signed up with that email first.
    if (recipient) {
      // Re-sharing only changes the permission; it never re-opens an accepted share as pending.
      db.prepare(
        `INSERT INTO share (id, owner_id, kind, item_id, recipient_id, permission) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (kind, item_id, recipient_id) DO UPDATE SET permission = excluded.permission`
      ).run(randomUUID(), userId, kind, itemId, recipient.id, body.permission)
    }
    saveContact(userId, to)
    return c.json({ ok: true })
  }
)

sharing.patch(
  "/shares/:id",
  validate("param", idParam),
  validate("json", sharePatchBody),
  (c) => {
    const { permission } = c.req.valid("json")
    const { id: shareId } = c.req.valid("param")
    const r = db
      .prepare(`UPDATE share SET permission = ? WHERE id = ? AND owner_id = ?`)
      .run(permission, shareId, c.var.user.id)
    return r.changes
      ? c.json({ ok: true })
      : c.json({ error: "Not found" }, 404)
  }
)

sharing.delete("/shares/:id", validate("param", idParam), (c) => {
  const userId = c.var.user.id
  const { id: shareId } = c.req.valid("param")
  const r = db
    .prepare(
      `DELETE FROM share WHERE id = ? AND (owner_id = ? OR recipient_id = ?)`
    )
    .run(shareId, userId, userId)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

sharing.delete(
  "/shares/:kind/:itemId/me",
  validate("param", shareItemParam),
  (c) => {
    const { kind, itemId } = c.req.valid("param")
    const r = db
      .prepare(
        `DELETE FROM share WHERE kind = ? AND item_id = ? AND recipient_id = ?`
      )
      .run(kind, itemId, c.var.user.id)
    return r.changes
      ? c.json({ ok: true })
      : c.json({ error: "Not found" }, 404)
  }
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
sharing.get("/invites", (c) => {
  const rows = db
    .prepare(
      `SELECT id, kind, item_id AS itemId, owner_id AS ownerId, permission
         FROM share WHERE recipient_id = ? AND status = 'pending' ORDER BY created_at`
    )
    .all(c.var.user.id) as unknown as InviteRow[]
  const invites = rows.flatMap((r) => {
    if (!isShareKind(r.kind)) return []
    const item = itemName(r.kind, r.itemId)
    if (item === null) return []
    return [
      {
        id: r.id,
        kind: r.kind,
        name: item,
        permission: r.permission,
        owner: ownerOf(r.ownerId),
      },
    ]
  })
  return c.json({ invites })
})

sharing.post("/invites/:id/accept", validate("param", idParam), (c) => {
  const { id: shareId } = c.req.valid("param")
  const r = db
    .prepare(
      `UPDATE share SET status = 'accepted' WHERE id = ? AND recipient_id = ? AND status = 'pending'`
    )
    .run(shareId, c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

sharing.post("/invites/:id/decline", validate("param", idParam), (c) => {
  const { id: shareId } = c.req.valid("param")
  const r = db
    .prepare(
      `DELETE FROM share WHERE id = ? AND recipient_id = ? AND status = 'pending'`
    )
    .run(shareId, c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})
