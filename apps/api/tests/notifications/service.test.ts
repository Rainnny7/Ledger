import assert from "node:assert/strict"
import { before, test } from "node:test"
import { and, eq, sql } from "drizzle-orm"
import { db, runMigrations, setSetting } from "../../src/db/connection.ts"
import {
	notification,
	notificationPreference,
	user,
} from "../../src/db/schema/index.ts"
import { getSmtpConfig, saveSmtpConfig } from "../../src/mail/smtp.ts"
import {
	countUnread,
	getNotificationPreferences,
	setNotificationPreference,
	listNotifications,
	markRead,
	markUnread,
	notifyUser,
	purgeStaleReadNotifications,
	setNotificationMailSender,
} from "../../src/notifications/service.ts"

const U1 = "00000000-0000-4000-8000-000000000001"
const U2 = "00000000-0000-4000-8000-000000000002"

before(() => {
	runMigrations()
	const now = new Date().toISOString()
	for (const [id, email] of [
		[U1, "one@example.com"],
		[U2, "two@example.com"],
	] as const) {
		db.insert(user)
			.values({
				id,
				name: id,
				email,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()
			.run()
	}
	setSetting("smtp_config", "")
	db.delete(notification).run()
})

test("notifications are scoped by userId", async () => {
	await notifyUser({
		userId: U1,
		source: "admin",
		title: "A",
		body: "for one",
	})
	await notifyUser({
		userId: U2,
		source: "admin",
		title: "B",
		body: "for two",
	})
	assert.equal(listNotifications(U1).length, 1)
	assert.equal(listNotifications(U1)[0]?.title, "A")
	assert.equal(listNotifications(U2)[0]?.title, "B")
})

test("unread count and mark read", async () => {
	db.delete(notification).run()
	await notifyUser({
		userId: U1,
		source: "admin",
		title: "Unread",
		body: "x",
	})
	const items = listNotifications(U1)
	assert.equal(countUnread(U1), 1)
	markRead(U1, items[0]!.id)
	assert.equal(countUnread(U1), 0)
	assert.ok(listNotifications(U1)[0]?.readAt)
})

test("mark unread restores unread state", async () => {
	db.delete(notification).run()
	await notifyUser({
		userId: U1,
		source: "admin",
		title: "Toggle",
		body: "x",
	})
	const id = listNotifications(U1)[0]!.id
	markRead(U1, id)
	assert.equal(countUnread(U1), 0)
	markUnread(U1, id)
	assert.equal(countUnread(U1), 1)
	assert.equal(listNotifications(U1)[0]?.readAt, null)
})

test("source is stored and returned", async () => {
	db.delete(notification).run()
	await notifyUser({
		userId: U1,
		source: "security",
		title: "Sec",
		body: "b",
	})
	await notifyUser({
		userId: U1,
		source: "admin",
		title: "Admin",
		body: "b",
	})
	const items = listNotifications(U1)
	assert.equal(items.find((row) => row.title === "Sec")?.source, "security")
	assert.equal(items.find((row) => row.title === "Admin")?.source, "admin")
})

test("purge removes only read notifications older than 90 days", async () => {
	db.delete(notification).run()
	await notifyUser({
		userId: U1,
		source: "admin",
		title: "Fresh read",
		body: "x",
	})
	await notifyUser({
		userId: U1,
		source: "admin",
		title: "Unread",
		body: "x",
	})
	const readId = listNotifications(U1).find(
		(row) => row.title === "Fresh read"
	)!.id
	markRead(U1, readId)
	db.update(notification)
		.set({ readAt: sql`datetime('now', '-100 days')` })
		.where(and(eq(notification.userId, U1), eq(notification.id, readId)))
		.run()
	assert.equal(purgeStaleReadNotifications(), 1)
	const remaining = listNotifications(U1)
	assert.equal(remaining.length, 1)
	assert.equal(remaining[0]?.title, "Unread")
})

test("unrouted notify ignores preferences and is always in-app", async () => {
	setNotificationPreference(U2, "security", { email: false, inApp: false })
	setNotificationPreference(U2, "digest", { email: false, inApp: false })
	const priorCount = listNotifications(U2).length
	await notifyUser({
		userId: U2,
		source: "admin",
		title: "Admin",
		body: "always shown",
	})
	assert.equal(listNotifications(U2).length, priorCount + 1)
})

test("mail failure does not block notifyUser", async () => {
	setNotificationMailSender(async () => {
		throw new Error("smtp down")
	})
	saveSmtpConfig({
		host: "smtp.example.com",
		port: 587,
		secure: false,
		username: "u",
		password: "secret",
		fromAddress: "from@example.com",
		fromName: "Ledger",
	})
	const priorCount = listNotifications(U1).length
	await notifyUser({
		userId: U1,
		source: "admin",
		title: "With email",
		body: "body",
		email: true,
	})
	assert.equal(listNotifications(U1).length, priorCount + 1)
	setNotificationMailSender((await import("../../src/mail/smtp.ts")).sendMail)
})

test("getSmtpConfig never returns the password", () => {
	setSetting("smtp_config", "")
	saveSmtpConfig({
		host: "smtp.example.com",
		port: 465,
		secure: true,
		username: "mailer",
		password: "hunter2",
		fromAddress: "ledger@example.com",
		fromName: "Ledger",
	})
	const pub = getSmtpConfig()
	assert.equal("password" in pub, false)
	assert.equal(pub.passwordSet, true)
	assert.equal(pub.configured, true)
})

test("email and in-app routing matrix", async () => {
	const sent: string[] = []
	setNotificationMailSender(async (message) => {
		sent.push(message.subject)
	})
	saveSmtpConfig({
		host: "smtp.example.com",
		port: 587,
		secure: false,
		username: "u",
		password: "secret",
		fromAddress: "from@example.com",
		fromName: "Ledger",
	})
	db.delete(notification).run()
	db.delete(notificationPreference)
		.where(eq(notificationPreference.userId, U2))
		.run()
	assert.deepEqual(getNotificationPreferences(U2), {
		security: { email: true, inApp: true },
		digest: { email: true, inApp: true },
	})

	// Both on: mail and in-app, using the mail override.
	assert.equal(
		await notifyUser({
			userId: U2,
			source: "digest",
			title: "Title",
			body: "Body",
			mail: { subject: "Mail subject", text: "Mail text" },
		}),
		true
	)
	assert.deepEqual(sent, ["Mail subject"])
	assert.equal(listNotifications(U2).length, 1)
	assert.equal(listNotifications(U2)[0]?.source, "digest")

	// The caller's email flag still gates mail.
	await notifyUser({
		userId: U2,
		source: "digest",
		title: "No mail",
		body: "b",
		email: false,
	})
	assert.equal(sent.length, 1)
	assert.equal(listNotifications(U2).length, 2)

	// In-app only.
	setNotificationPreference(U2, "digest", { email: false, inApp: true })
	assert.equal(
		await notifyUser({
			userId: U2,
			source: "digest",
			title: "T",
			body: "b",
		}),
		false
	)
	assert.equal(sent.length, 1)
	assert.equal(listNotifications(U2).length, 3)

	// Email only.
	setNotificationPreference(U2, "digest", { email: true, inApp: false })
	assert.equal(
		await notifyUser({
			userId: U2,
			source: "digest",
			title: "E",
			body: "b",
		}),
		true
	)
	assert.equal(sent.length, 2)
	assert.equal(listNotifications(U2).length, 3)

	// Neither: nothing at all, and other sources are unaffected.
	setNotificationPreference(U2, "digest", { email: false, inApp: false })
	await notifyUser({ userId: U2, source: "digest", title: "T", body: "b" })
	assert.equal(sent.length, 2)
	assert.equal(listNotifications(U2).length, 3)
	assert.deepEqual(getNotificationPreferences(U2).security, {
		email: true,
		inApp: true,
	})

	// Upsert replaces toggles.
	setNotificationPreference(U2, "digest", { email: true, inApp: true })
	assert.deepEqual(getNotificationPreferences(U2).digest, {
		email: true,
		inApp: true,
	})

	// Without SMTP the in-app copy is still created when inApp is on.
	setSetting("smtp_config", "")
	assert.equal(
		await notifyUser({
			userId: U2,
			source: "security",
			title: "S",
			body: "b",
		}),
		false
	)
	assert.equal(listNotifications(U2).length, 4)
	setNotificationMailSender((await import("../../src/mail/smtp.ts")).sendMail)
})
