import assert from "node:assert/strict"
import { before, test } from "node:test"
import { db, runMigrations, setSetting } from "../../src/db/connection.ts"
import { notification, user } from "../../src/db/schema/index.ts"
import {
	getSmtpConfig,
	saveSmtpConfig,
} from "../../src/mail/smtp.ts"
import {
	countUnread,
	listNotifications,
	markRead,
	notifyUser,
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
	await notifyUser({ userId: U1, title: "A", body: "for one" })
	await notifyUser({ userId: U2, title: "B", body: "for two" })
	assert.equal(listNotifications(U1).length, 1)
	assert.equal(listNotifications(U1)[0]?.title, "A")
	assert.equal(listNotifications(U2)[0]?.title, "B")
})

test("unread count and mark read", async () => {
	db.delete(notification).run()
	await notifyUser({ userId: U1, title: "Unread", body: "x" })
	const items = listNotifications(U1)
	assert.equal(countUnread(U1), 1)
	markRead(U1, items[0]!.id)
	assert.equal(countUnread(U1), 0)
	assert.ok(listNotifications(U1)[0]?.readAt)
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
		title: "With email",
		body: "body",
		email: true,
	})
	assert.equal(listNotifications(U1).length, priorCount + 1)
	setNotificationMailSender(
		(await import("../../src/mail/smtp.ts")).sendMail
	)
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