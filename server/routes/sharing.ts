import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { z } from "zod"
import type { auth } from "../auth/index.ts"
import { db } from "../db.ts"
import { isDemoEmail } from "../demo/personas.ts"
import { access, isShareKind, PERMISSIONS, type ShareRow } from "../sharing.ts"

type Vars = { Variables: { user: typeof auth.$Infer.Session.user } }
export const sharing = new Hono<Vars>()

const email = z.string().trim().toLowerCase().email().max(254)
const name = z.string().trim().max(80).nullable().optional()

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

sharing.post("/contacts", async (c) => {
  const body = z
    .object({ email, name })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success)
    return c.json({ error: "Enter a valid email address." }, 400)
  if (body.data.email === c.var.user.email.toLowerCase())
    return c.json({ error: "That’s your own email." }, 400)
  if (isDemoEmail(body.data.email))
    return c.json({ error: "Enter a valid email address." }, 400)
  return c.json({
    contact: saveContact(c.var.user.id, body.data.email, body.data.name),
  })
})

sharing.patch("/contacts/:id", async (c) => {
  const body = z
    .object({ name })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the name." }, 400)
  const r = db
    .prepare(`UPDATE contact SET name = ? WHERE id = ? AND user_id = ?`)
    .run(body.data.name?.trim() || null, c.req.param("id"), c.var.user.id)
  if (!r.changes) return c.json({ error: "Not found" }, 404)
  return c.json({
    contact: db
      .prepare(`SELECT ${CONTACT_COLS} FROM contact WHERE id = ?`)
      .get(c.req.param("id")),
  })
})

/** Removing a contact doesn't stop sharing with them; that's done per item. */
sharing.delete("/contacts/:id", (c) => {
  const r = db
    .prepare(`DELETE FROM contact WHERE id = ? AND user_id = ?`)
    .run(c.req.param("id"), c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

// ---------------------------------------------------------------- shares

function loadShares(ownerId: string, kind: string, itemId: string) {
  return db
    .prepare(
      `SELECT s.id, u.email, c.name, s.permission
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

sharing.get("/shares/:kind/:itemId", (c) => {
  const { kind, itemId } = c.req.param()
  if (!ownedItem(c.var.user.id, kind, itemId))
    return c.json({ error: "Not found" }, 404)
  return c.json({ shares: loadShares(c.var.user.id, kind, itemId) })
})

sharing.post("/shares/:kind/:itemId", async (c) => {
  const body = z
    .object({ email, permission: z.enum(PERMISSIONS).default("view") })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success)
    return c.json({ error: "Enter a valid email address." }, 400)
  const { kind, itemId } = c.req.param()
  const userId = c.var.user.id
  if (!ownedItem(userId, kind, itemId))
    return c.json({ error: "Not found" }, 404)
  const to = body.data.email
  if (to === c.var.user.email.toLowerCase())
    return c.json({ error: "That’s your own email." }, 400)
  const recipient = isDemoEmail(to)
    ? undefined
    : (db.prepare(`SELECT id FROM user WHERE lower(email) = ?`).get(to) as
        | { id: string }
        | undefined)
  // Shares go to an account, never a bare address: a pending invite would hand the item to whoever
  // signed up with that email first.
  if (!recipient)
    return c.json(
      {
        error:
          "No Ledger account uses that email. Ask them to sign up, then share again.",
      },
      404
    )
  db.prepare(
    `INSERT INTO share (id, owner_id, kind, item_id, recipient_id, permission) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (kind, item_id, recipient_id) DO UPDATE SET permission = excluded.permission`
  ).run(randomUUID(), userId, kind, itemId, recipient.id, body.data.permission)
  saveContact(userId, to)
  return c.json({ shares: loadShares(userId, kind, itemId) })
})

sharing.patch("/shares/:id", async (c) => {
  const body = z
    .object({ permission: z.enum(PERMISSIONS) })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Pick view or edit." }, 400)
  const r = db
    .prepare(`UPDATE share SET permission = ? WHERE id = ? AND owner_id = ?`)
    .run(body.data.permission, c.req.param("id"), c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

/** The owner stops sharing, or the person it was shared with leaves. */
sharing.delete("/shares/:id", (c) => {
  const userId = c.var.user.id
  const r = db
    .prepare(
      `DELETE FROM share WHERE id = ? AND (owner_id = ? OR recipient_id = ?)`
    )
    .run(c.req.param("id"), userId, userId)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

/** Leave something shared with you, by item (you don't see share ids for those). */
sharing.delete("/shares/:kind/:itemId/me", (c) => {
  const { kind, itemId } = c.req.param()
  const r = db
    .prepare(
      `DELETE FROM share WHERE kind = ? AND item_id = ? AND recipient_id = ?`
    )
    .run(kind, itemId, c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})
