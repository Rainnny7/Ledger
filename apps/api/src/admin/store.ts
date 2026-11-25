/**
 * Instance ownership and the audit log (admin actions, and sign-ins/outs).
 *
 * The owner is the account that set the instance up (the first sign-up). Admins can manage
 * everyone else, but only the owner can grant or take away admin, and nobody but the owner can
 * touch the owner's account. That way a second admin, or a hijacked admin session, can't lock the
 * owner out or quietly take over.
 */
import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, notLike, sql, type SQL } from "drizzle-orm"
import { db, getSetting, setSetting } from "../db/connection.ts"
import { adminAudit, user } from "../db/schema/index.ts"
import { isInstanceOwnerFor } from "./owner-gate.ts"

export { isInstanceOwnerFor } from "./owner-gate.ts"

/** Oldest non-demo account matching `condition`, or null. */
function oldestRealUserId(condition?: SQL) {
	return (
		db
			.select({ id: user.id })
			.from(user)
			.where(and(notLike(user.id, "ledger-demo%"), condition))
			.orderBy(asc(user.createdAt))
			.limit(1)
			.get()?.id ?? null
	)
}

/**
 * The owner's user id. Falls back to the oldest admin (or, failing that, promotes the oldest
 * account) when the owner hasn't been recorded yet or has deleted their account.
 */
export function getOwnerId(): string | null {
	const saved = getSetting("owner_user_id")
	if (
		saved &&
		db.select({ id: user.id }).from(user).where(eq(user.id, saved)).get()
	) {
		return saved
	}
	let id = oldestRealUserId(eq(user.role, "admin"))
	if (!id) {
		id = oldestRealUserId()
		if (id) {
			db.update(user).set({ role: "admin" }).where(eq(user.id, id)).run()
		}
	}
	if (id) {
		setSetting("owner_user_id", id)
	}
	return id
}

/** Whether `userId` is the instance owner (first account / saved owner id). */
export function isInstanceOwner(userId: string | null | undefined): boolean {
	return isInstanceOwnerFor(userId, getOwnerId())
}

/** Login email for a user id (admin displays and audit). */
export function emailOf(userId: string): string | null {
	return (
		db
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, userId))
			.get()?.email ?? null
	)
}

/** admin: something done from the Admin page. auth: signing in or out, passwords, 2FA, devices. */
export type AuditKind = "admin" | "auth"

/** One row written to the admin/auth audit log. */
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
const clip = (value: string | null | undefined, maxLen = 200) =>
	value ? value.slice(0, maxLen) : null

const auditQuote = (value: string) => JSON.stringify(value)

/** Records an event in the audit log and prints it to the server log. */
export function audit(entry: AuditEntry) {
	const kind = entry.kind ?? "admin"
	const row = {
		action: entry.failed ? `${entry.action} (failed)` : entry.action,
		actorEmail: clip(entry.actorEmail, 254),
		targetEmail: clip(entry.targetEmail, 254),
		detail: clip(entry.detail),
		ip: clip(entry.ip, 64),
	}
	db.insert(adminAudit)
		.values({
			id: randomUUID(),
			kind,
			actorId: entry.actorId,
			actorEmail: row.actorEmail,
			action: row.action,
			targetId: entry.targetId ?? null,
			targetEmail: row.targetEmail,
			detail: row.detail,
			ip: row.ip,
		})
		.run()
	// Keep the log from growing forever.
	db.delete(adminAudit)
		.where(
			sql`${adminAudit.at} < (SELECT ${adminAudit.at} FROM ${adminAudit} ORDER BY ${adminAudit.at} DESC LIMIT 1 OFFSET ${sql.raw(String(KEEP - 1))})`
		)
		.run()

	const parts = [`[audit] ${kind}: ${row.action}`]
	if (row.actorEmail) {
		parts.push(`by=${auditQuote(row.actorEmail)}`)
	}
	if (row.targetEmail) {
		parts.push(`target=${auditQuote(row.targetEmail)}`)
	}
	if (row.detail) {
		parts.push(`detail=${JSON.stringify(row.detail)}`)
	}
	if (row.ip) {
		parts.push(`ip=${row.ip}`)
	}
	;(entry.failed ? console.warn : console.log)(parts.join(" "))
}

/** Audit row as returned to the admin activity feed. */
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

/** Recent audit events, optionally filtered by kind. */
export function recentAudit({
	kind,
	limit = 100,
}: { kind?: AuditKind; limit?: number } = {}) {
	return db
		.select({
			id: adminAudit.id,
			at: adminAudit.at,
			kind: adminAudit.kind,
			actorEmail: adminAudit.actorEmail,
			action: adminAudit.action,
			targetEmail: adminAudit.targetEmail,
			detail: adminAudit.detail,
			ip: adminAudit.ip,
		})
		.from(adminAudit)
		.where(kind ? eq(adminAudit.kind, kind) : undefined)
		.orderBy(desc(adminAudit.at), sql`rowid DESC`)
		.limit(limit)
		.all() as AuditRow[]
}

/** Whether a user must replace a temporary password before using the app. */
export function setMustChangePassword(userId: string, value: boolean) {
	db.update(user)
		.set({ mustChangePassword: value })
		.where(eq(user.id, userId))
		.run()
}
