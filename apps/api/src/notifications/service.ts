import { randomUUID } from "node:crypto"
import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { db } from "../db/connection.ts"
import {
	notification,
	notificationPreference,
	user,
} from "../db/schema/index.ts"
import { isSmtpConfigured, sendMail } from "../mail/smtp.ts"
import { getDiscordWebhook, sendDiscordNotification } from "./discord.ts"

/** Notification severity shown in the app. */
export type NotificationKind = "info" | "success" | "warning" | "alert"

/** Message sources a user can route independently. */
export const NOTIFICATION_SOURCES = ["security", "digest"] as const

/** One of {@link NOTIFICATION_SOURCES}. */
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number]

/** Independent email, in-app, and Discord delivery toggles for one source. */
export interface NotificationPreference {
	email: boolean
	inApp: boolean
	discord: boolean
}

const DEFAULT_PREFERENCE: NotificationPreference = {
	email: true,
	inApp: true,
	discord: false,
}

/** Email content that differs from the in-app title and body. */
export interface NotificationMail {
	subject: string
	text: string
	html?: string
	headers?: Record<string, string>
}

/** Every origin stored on a notification: the user-routable sources plus always-delivered admin messages. */
export type NotificationOrigin = NotificationSource | "admin"

/** Options for {@link notifyUser}. */
export interface NotifyUserOptions {
	userId: string
	/** Where the message comes from. `admin` messages skip user preferences; the rest follow them. */
	source: NotificationOrigin
	title: string
	body: string
	kind?: NotificationKind
	href?: string | null
	/** Caller-side gate: `false` suppresses email even when the user's email preference is on. */
	email?: boolean
	/** Email content override; defaults to the title and body. */
	mail?: NotificationMail
}

/** One row returned from {@link listNotifications}. */
export interface NotificationItem {
	id: string
	kind: NotificationKind
	title: string
	body: string
	href: string | null
	source: string | null
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

/** Emails the user; returns whether the mail was handed to SMTP. Failures are logged, never thrown. */
async function emailUserNotification(
	userId: string,
	mail: NotificationMail
): Promise<boolean> {
	if (!isSmtpConfigured()) {
		return false
	}
	const row = db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.get()
	if (!row?.email) {
		return false
	}
	try {
		await notificationMailSender({ to: row.email, ...mail })
		return true
	} catch (error) {
		console.warn(
			`Notification email failed for ${userId}:`,
			error instanceof Error ? error.message : error
		)
		return false
	}
}

/** The user's delivery toggles for every source, with both on where they never chose. */
export function getNotificationPreferences(
	userId: string
): Record<NotificationSource, NotificationPreference> {
	const preferences = Object.fromEntries(
		NOTIFICATION_SOURCES.map((source) => [
			source,
			{ ...DEFAULT_PREFERENCE },
		])
	) as Record<NotificationSource, NotificationPreference>
	const rows = db
		.select({
			source: notificationPreference.source,
			email: notificationPreference.email,
			inApp: notificationPreference.inApp,
			discord: notificationPreference.discord,
		})
		.from(notificationPreference)
		.where(eq(notificationPreference.userId, userId))
		.all()
	for (const row of rows) {
		if ((NOTIFICATION_SOURCES as readonly string[]).includes(row.source)) {
			preferences[row.source as NotificationSource] = {
				email: row.email,
				inApp: row.inApp,
				discord: row.discord,
			}
		}
	}
	return preferences
}

/** Saves (upserts) the user's delivery toggles for one source. */
export function setNotificationPreference(
	userId: string,
	source: NotificationSource,
	preference: NotificationPreference
): void {
	db.insert(notificationPreference)
		.values({
			userId,
			source,
			email: preference.email,
			inApp: preference.inApp,
			discord: preference.discord,
		})
		.onConflictDoUpdate({
			target: [
				notificationPreference.userId,
				notificationPreference.source,
			],
			set: {
				email: preference.email,
				inApp: preference.inApp,
				discord: preference.discord,
			},
		})
		.run()
}

/**
 * Delivers a notification. For `admin` messages, the in-app row is always stored and email is sent only
 * when `options.email` is true (still gated by SMTP and the user's address); preferences are not
 * consulted. For any other source, delivery follows the user's toggles for that source; when both are off,
 * nothing happens. Mail failures are logged and never roll back the in-app row. Resolves to whether
 * an email was actually sent.
 */
export async function notifyUser(options: NotifyUserOptions): Promise<boolean> {
	const insertInApp = () => {
		db.insert(notification)
			.values({
				id: randomUUID(),
				userId: options.userId,
				kind: options.kind ?? "info",
				title: options.title,
				body: options.body,
				href: options.href?.trim() || null,
				source: options.source,
			})
			.run()
	}
	if (options.source === "admin") {
		insertInApp()
		if (options.email !== true) {
			return false
		}
		return emailUserNotification(
			options.userId,
			options.mail ?? { subject: options.title, text: options.body }
		)
	}
	const preference = getNotificationPreferences(options.userId)[
		options.source
	]
	if (!preference.email && !preference.inApp && !preference.discord) {
		return false
	}
	if (preference.inApp) {
		insertInApp()
	}
	let emailSent = false
	if (preference.email && options.email !== false) {
		emailSent = await emailUserNotification(
			options.userId,
			options.mail ?? { subject: options.title, text: options.body }
		)
	}
	if (preference.discord) {
		const webhookUrl = getDiscordWebhook(options.userId)
		if (webhookUrl) {
			await sendDiscordNotification(webhookUrl, {
				title: options.title,
				body: options.body,
				kind: options.kind ?? "info",
				href: options.href,
			})
		}
	}
	return emailSent
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
			source: notification.source,
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

/** Clears read state on one notification when it belongs to the user. */
export function markUnread(userId: string, id: string): void {
	db.update(notification)
		.set({ readAt: null })
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
	db.delete(notification).where(eq(notification.userId, userId)).run()
}

/** Drops read notifications older than 90 days; returns how many rows were removed. */
export function purgeStaleReadNotifications(): number {
	return db
		.delete(notification)
		.where(
			and(
				isNotNull(notification.readAt),
				lt(notification.readAt, sql`datetime('now', '-90 days')`)
			)
		)
		.returning({ id: notification.id })
		.all().length
}
