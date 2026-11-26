import { randomUUID } from "node:crypto"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "../db/connection.ts"
import { notification, user } from "../db/schema/index.ts"
import { isSmtpConfigured, sendMail } from "../mail/smtp.ts"

/** Notification severity shown in the app. */
export type NotificationKind = "info" | "success" | "warning" | "alert"

/** Options for {@link notifyUser}. */
export interface NotifyUserOptions {
	userId: string
	title: string
	body: string
	kind?: NotificationKind
	href?: string | null
	email?: boolean
}

/** One row returned from {@link listNotifications}. */
export interface NotificationItem {
	id: string
	kind: NotificationKind
	title: string
	body: string
	href: string | null
	readAt: string | null
	createdAt: string
}

type MailSender = typeof sendMail

/** Test hook: replace outbound mail without touching SMTP configuration. */
export let notificationMailSender: MailSender = sendMail

/** @internal Replaces the mail sender used by {@link notifyUser} (tests). */
export function setNotificationMailSender(sender: MailSender): void {
	notificationMailSender = sender
}

async function emailUserNotification(
	userId: string,
	title: string,
	body: string
): Promise<void> {
	if (!isSmtpConfigured()) {
		return
	}
	const row = db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.get()
	if (!row?.email) {
		return
	}
	try {
		await notificationMailSender({
			to: row.email,
			subject: title,
			text: body,
		})
	} catch (error) {
		console.warn(
			`Notification email failed for ${userId}:`,
			error instanceof Error ? error.message : error
		)
	}
}

/**
 * Inserts an in-app notification for one user. When `email` is true and SMTP is configured, also
 * emails the user; mail failures are logged and never roll back the notification.
 */
export async function notifyUser(options: NotifyUserOptions): Promise<void> {
	const id = randomUUID()
	const kind = options.kind ?? "info"
	db.insert(notification)
		.values({
			id,
			userId: options.userId,
			kind,
			title: options.title,
			body: options.body,
			href: options.href?.trim() || null,
		})
		.run()
	if (options.email) {
		await emailUserNotification(options.userId, options.title, options.body)
	}
}

/** Inserts the same notification for many users. */
export async function notifyUsers(
	userIds: string[],
	options: Omit<NotifyUserOptions, "userId">
): Promise<void> {
	for (const userId of userIds) {
		await notifyUser({ ...options, userId })
	}
}

/** Newest notifications for one user (default limit 50). */
export function listNotifications(
	userId: string,
	limit = 50
): NotificationItem[] {
	return db
		.select({
			id: notification.id,
			kind: notification.kind,
			title: notification.title,
			body: notification.body,
			href: notification.href,
			readAt: notification.readAt,
			createdAt: notification.createdAt,
		})
		.from(notification)
		.where(eq(notification.userId, userId))
		.orderBy(desc(notification.createdAt))
		.limit(limit)
		.all() as NotificationItem[]
}

/** Unread count for one user. */
export function countUnread(userId: string): number {
	const row = db
		.select({ count: sql<number>`count(*)` })
		.from(notification)
		.where(
			and(eq(notification.userId, userId), isNull(notification.readAt))
		)
		.get()
	return row?.count ?? 0
}

/** Marks one notification read when it belongs to the user. */
export function markRead(userId: string, id: string): void {
	db.update(notification)
		.set({ readAt: sql`(datetime('now'))` })
		.where(and(eq(notification.userId, userId), eq(notification.id, id)))
		.run()
}

/** Marks every notification for the user read. */
export function markAllRead(userId: string): void {
	db.update(notification)
		.set({ readAt: sql`(datetime('now'))` })
		.where(
			and(eq(notification.userId, userId), isNull(notification.readAt))
		)
		.run()
}

/** Deletes one notification when it belongs to the user. */
export function deleteNotification(userId: string, id: string): void {
	db.delete(notification)
		.where(and(eq(notification.userId, userId), eq(notification.id, id)))
		.run()
}

/** Deletes every notification for the user. */
export function clearAll(userId: string): void {
	db.delete(notification)
		.where(eq(notification.userId, userId))
		.run()
}