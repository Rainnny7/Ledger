/**
 * Instance ownership and the audit log (admin actions, and sign-ins/outs).
 *
 * The owner is the account that set the instance up (the first sign-up). Admins can manage
 * everyone else, but only the owner can grant or take away admin, and nobody but the owner can
 * touch the owner's account. That way a second admin, or a hijacked admin session, can't lock the
 * owner out or quietly take over.
 */
import { randomUUID } from "node:crypto"
import { db, getSetting, setSetting } from "./db.ts"
import { DEMO_USER_ID } from "./demo.ts"

export function migrateAdminTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      actor_id TEXT,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_id TEXT,
      target_email TEXT,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON admin_audit(at DESC);
  `)
  // Added with sign-in auditing: what sort of event it is, and where it came from.
  const cols = new Set(
    (
      db.prepare(`PRAGMA table_info(admin_audit)`).all() as { name: string }[]
    ).map((c) => c.name)
  )
  if (!cols.has("kind"))
    db.exec(
      `ALTER TABLE admin_audit ADD COLUMN kind TEXT NOT NULL DEFAULT 'admin'`
    )
  if (!cols.has("ip")) db.exec(`ALTER TABLE admin_audit ADD COLUMN ip TEXT`)
  getOwnerId()
}

/**
 * The owner's user id. Falls back to the oldest admin (or, failing that, promotes the oldest
 * account) when the owner hasn't been recorded yet or has deleted their account.
 */
export function getOwnerId(): string | null {
  const saved = getSetting("owner_user_id")
  if (saved && db.prepare(`SELECT 1 FROM user WHERE id = ?`).get(saved))
    return saved
  const pick = (sql: string) =>
    (db.prepare(sql).get(DEMO_USER_ID) as { id: string } | undefined)?.id ??
    null
  let id = pick(
    `SELECT id FROM user WHERE id != ? AND role = 'admin' ORDER BY createdAt LIMIT 1`
  )
  if (!id) {
    id = pick(`SELECT id FROM user WHERE id != ? ORDER BY createdAt LIMIT 1`)
    if (id) db.prepare(`UPDATE user SET role = 'admin' WHERE id = ?`).run(id)
  }
  if (id) setSetting("owner_user_id", id)
  return id
}

export function emailOf(userId: string): string | null {
  return (
    (
      db.prepare(`SELECT email FROM user WHERE id = ?`).get(userId) as
        | { email: string }
        | undefined
    )?.email ?? null
  )
}

/** admin: something done from the Admin page. auth: signing in or out, passwords, 2FA, devices. */
export type AuditKind = "admin" | "auth"

export interface AuditEntry {
  kind?: AuditKind
  /** Whether it went through; failed attempts (wrong password, bad code) are logged too. */
  failed?: boolean
  ip?: string | null
  actorId: string | null
  actorEmail: string | null
  action: string
  targetId?: string | null
  targetEmail?: string | null
  detail?: string | null
}

const KEEP = 2000
const clip = (v: string | null | undefined, n = 200) =>
  v ? v.slice(0, n) : null

/** Records an event in the audit log and prints it to the server log. */
export function audit(e: AuditEntry) {
  const kind = e.kind ?? "admin"
  const row = {
    action: e.failed ? `${e.action} (failed)` : e.action,
    actorEmail: clip(e.actorEmail, 254),
    targetEmail: clip(e.targetEmail, 254),
    detail: clip(e.detail),
    ip: clip(e.ip, 64),
  }
  db.prepare(
    `INSERT INTO admin_audit (id, kind, actor_id, actor_email, action, target_id, target_email, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    kind,
    e.actorId,
    row.actorEmail,
    row.action,
    e.targetId ?? null,
    row.targetEmail,
    row.detail,
    row.ip
  )
  // Keep the log from growing forever.
  db.prepare(
    `DELETE FROM admin_audit WHERE at < (SELECT at FROM admin_audit ORDER BY at DESC LIMIT 1 OFFSET ${KEEP - 1})`
  ).run()

  const parts = [`[audit] ${kind}: ${row.action}`]
  if (row.actorEmail) parts.push(`by=${row.actorEmail}`)
  if (row.targetEmail) parts.push(`target=${row.targetEmail}`)
  if (row.detail) parts.push(`detail=${JSON.stringify(row.detail)}`)
  if (row.ip) parts.push(`ip=${row.ip}`)
  ;(e.failed ? console.warn : console.log)(parts.join(" "))
}

export interface AuditRow {
  id: string
  at: string
  kind: AuditKind
  actorEmail: string | null
  action: string
  targetEmail: string | null
  detail: string | null
  ip: string | null
}

export function recentAudit({
  kind,
  limit = 100,
}: { kind?: AuditKind; limit?: number } = {}) {
  return db
    .prepare(
      `SELECT id, at, kind, actor_email AS actorEmail, action, target_email AS targetEmail, detail, ip
       FROM admin_audit ${kind ? "WHERE kind = ?" : ""} ORDER BY at DESC, rowid DESC LIMIT ?`
    )
    .all(...(kind ? [kind, limit] : [limit])) as unknown as AuditRow[]
}

/** Whether a user must replace a temporary password before using the app. */
export function setMustChangePassword(userId: string, value: boolean) {
  db.prepare(`UPDATE user SET mustChangePassword = ? WHERE id = ?`).run(
    value ? 1 : 0,
    userId
  )
}
