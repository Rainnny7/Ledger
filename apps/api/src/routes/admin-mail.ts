import { notLike } from "drizzle-orm"
import { Elysia } from "elysia"
import { z } from "zod"
import { adminUser } from "./session.ts"
import { audit, isInstanceOwner } from "../admin/store.ts"
import { CLIENT_IP_HEADER } from "../auth/hooks.ts"
import { isDemoUserId } from "../demo/personas.ts"
import { boundedString, id, jsonBody } from "../http/validation.ts"
import {
	getSmtpConfig,
	isSmtpConfigured,
	saveSmtpConfig,
	sendTestMail,
	type SmtpConfigInput,
} from "../mail/smtp.ts"
import { notifyUser, notifyUsers } from "../notifications/service.ts"
import { db } from "../db/connection.ts"
import { user as userTable } from "../db/schema/index.ts"

const smtpBody = z.object({
	host: boundedString(253),
	port: z.coerce.number().int().min(1).max(65535),
	secure: z.boolean(),
	username: boundedString(254),
	password: boundedString(500).optional(),
	fromAddress: boundedString(254).email(),
	fromName: boundedString(120),
	dkimDomainName: boundedString(253).optional(),
	dkimKeySelector: boundedString(63).optional(),
	dkimPrivateKey: boundedString(8000)
		.refine(
			(key) =>
				key === "" || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key),
			"The DKIM key must be a PEM private key"
		)
		.optional(),
})

const smtpTestBody = z.object({ to: boundedString(254).email() })

const notificationKind = z.enum(["info", "success", "warning", "alert"])

const adminNotificationBody = z.object({
	userIds: z.union([z.literal("all"), z.array(id).min(1).max(500)]),
	title: boundedString(120),
	body: boundedString(2000),
	kind: notificationKind.default("info"),
	href: boundedString(500).nullable().optional(),
	email: z.boolean(),
})

/**
 * Turns an SMTP failure into readable text. Connection failures often surface
 * as an AggregateError (one attempt per resolved address) with an empty
 * message, so fall back to the error code or the first nested error.
 */
function describeSmtpError(error: unknown): string {
	if (!(error instanceof Error)) {
		return "SMTP delivery failed."
	}
	if (error.message) {
		return error.message
	}
	const nested = error instanceof AggregateError ? error.errors[0] : undefined
	const source = nested instanceof Error ? nested : error
	const code = (source as { code?: string }).code
	if (source.message) {
		return source.message
	}
	return code ? `SMTP connection failed (${code}).` : "SMTP delivery failed."
}

/** Owner-only SMTP and admin notification broadcast routes (mount on `/api/admin`). */
export const adminMail = new Elysia({ name: "admin-mail" }).use(adminUser)

adminMail.get("/smtp", ({ user, status }) => {
	if (!isInstanceOwner(user.id)) {
		return status(403, {
			error: "Only the instance owner can view SMTP settings.",
		})
	}
	return getSmtpConfig()
})

adminMail.put(
	"/smtp",
	({ user, body, request, status }) => {
		if (!isInstanceOwner(user.id)) {
			return status(403, {
				error: "Only the instance owner can change SMTP settings.",
			})
		}
		const saved = saveSmtpConfig(body as SmtpConfigInput)
		audit({
			kind: "admin",
			ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
			actorId: user.id,
			actorEmail: user.email,
			action: "Updated SMTP settings",
		})
		return saved
	},
	{ body: jsonBody(smtpBody) }
)

adminMail.post(
	"/smtp/test",
	async ({ user, body, request, status }) => {
		if (!isInstanceOwner(user.id)) {
			return status(403, {
				error: "Only the instance owner can test SMTP.",
			})
		}
		if (!isSmtpConfigured()) {
			return status(400, { error: "SMTP is not configured." })
		}
		try {
			await sendTestMail(body.to)
			audit({
				kind: "admin",
				ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
				actorId: user.id,
				actorEmail: user.email,
				action: "Sent SMTP test",
				detail: body.to,
			})
			return { ok: true }
		} catch (error) {
			return status(502, { error: describeSmtpError(error) })
		}
	},
	{ body: jsonBody(smtpTestBody) }
)

adminMail.post(
	"/notifications",
	async ({ user, body, request, status }) => {
		let ids: string[]
		if (body.userIds === "all") {
			ids = db
				.select({ id: userTable.id })
				.from(userTable)
				.where(notLike(userTable.id, "ledger-demo%"))
				.all()
				.map((row) => row.id)
		} else {
			ids = body.userIds.filter((userId) => !isDemoUserId(userId))
		}
		if (ids.length === 0) {
			return status(400, { error: "No users to notify." })
		}
		const payload = {
			title: body.title,
			body: body.body,
			kind: body.kind,
			href: body.href,
			email: body.email,
		}
		if (ids.length === 1) {
			await notifyUser({ userId: ids[0]!, ...payload })
		} else {
			await notifyUsers(ids, payload)
		}
		audit({
			kind: "admin",
			ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
			actorId: user.id,
			actorEmail: user.email,
			action: "Sent admin notification",
			detail: body.title,
		})
		return { sent: ids.length }
	},
	{ body: jsonBody(adminNotificationBody) }
)
