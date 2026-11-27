import assert from "node:assert/strict"
import { before, test } from "node:test"
import { eq } from "drizzle-orm"
import { db, runMigrations } from "../../src/db/connection.ts"
import {
	notification,
	notificationPreference,
	user,
} from "../../src/db/schema/index.ts"
import {
	getDiscordWebhook,
	parseDiscordWebhookUrl,
	sendDiscordNotification,
	setDiscordWebhook,
	setNotificationDiscordSender,
} from "../../src/notifications/discord.ts"
import {
	listNotifications,
	notifyUser,
	setNotificationMailSender,
	setNotificationPreference,
} from "../../src/notifications/service.ts"

const U1 = "00000000-0000-4000-8000-0000000000d1"
const VALID_WEBHOOK =
	"https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF"

before(() => {
	runMigrations()
	const now = new Date().toISOString()
	db.insert(user)
		.values({
			id: U1,
			name: "discord-test",
			email: "discord@example.com",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing()
		.run()
	db.delete(notification).run()
	db.delete(notificationPreference)
		.where(eq(notificationPreference.userId, U1))
		.run()
	setDiscordWebhook(U1, null)
})

test("parseDiscordWebhookUrl accepts official hosts and paths", () => {
	assert.equal(parseDiscordWebhookUrl(VALID_WEBHOOK), VALID_WEBHOOK)
	assert.equal(
		parseDiscordWebhookUrl(
			"https://ptb.discord.com/api/webhooks/99/token_part"
		),
		"https://ptb.discord.com/api/webhooks/99/token_part"
	)
	assert.equal(
		parseDiscordWebhookUrl(
			"https://canary.discord.com/api/webhooks/1/ab-cd_ef"
		),
		"https://canary.discord.com/api/webhooks/1/ab-cd_ef"
	)
	assert.equal(
		parseDiscordWebhookUrl(
			"  https://discordapp.com/api/webhooks/42/secret  "
		),
		"https://discordapp.com/api/webhooks/42/secret"
	)
})

test("parseDiscordWebhookUrl rejects SSRF-prone or malformed URLs", () => {
	assert.equal(
		parseDiscordWebhookUrl("http://discord.com/api/webhooks/1/x"),
		null
	)
	assert.equal(
		parseDiscordWebhookUrl("https://evil.com/api/webhooks/1/x"),
		null
	)
	assert.equal(
		parseDiscordWebhookUrl("https://discord.com/api/webhooks/not-id/token"),
		null
	)
	assert.equal(
		parseDiscordWebhookUrl("https://discord.com:8443/api/webhooks/1/token"),
		null
	)
	assert.equal(
		parseDiscordWebhookUrl(
			"https://discord.com/api/webhooks/1/token?wait=true"
		),
		null
	)
	assert.equal(
		parseDiscordWebhookUrl(
			"https://user:pass@discord.com/api/webhooks/1/token"
		),
		null
	)
})

test("webhook is stored encrypted and never returned from getter as ciphertext", () => {
	setDiscordWebhook(U1, VALID_WEBHOOK)
	const raw = db
		.select({ discordWebhook: user.discordWebhook })
		.from(user)
		.where(eq(user.id, U1))
		.get()
	assert.ok(raw?.discordWebhook)
	assert.notEqual(raw.discordWebhook, VALID_WEBHOOK)
	assert.equal(getDiscordWebhook(U1), VALID_WEBHOOK)
	setDiscordWebhook(U1, null)
	assert.equal(getDiscordWebhook(U1), null)
})

test("notifyUser sends to Discord only when toggled and configured", async () => {
	const posts: unknown[] = []
	setNotificationDiscordSender(async (_url, body) => {
		posts.push(body)
		return new Response(null, { status: 204 })
	})
	setNotificationMailSender(async () => {})
	const prior = listNotifications(U1).length

	setNotificationPreference(U1, "security", {
		email: false,
		inApp: false,
		discord: true,
	})
	await notifyUser({
		userId: U1,
		source: "security",
		title: "No webhook",
		body: "skip",
	})
	assert.equal(posts.length, 0)

	setDiscordWebhook(U1, VALID_WEBHOOK)
	await notifyUser({
		userId: U1,
		source: "security",
		title: "Discord only",
		body: "delivered",
		kind: "warning",
	})
	assert.equal(posts.length, 1)
	assert.equal(listNotifications(U1).length, prior)

	setNotificationPreference(U1, "security", {
		email: false,
		inApp: true,
		discord: false,
	})
	await notifyUser({
		userId: U1,
		source: "security",
		title: "In-app",
		body: "no discord",
	})
	assert.equal(posts.length, 1)
	assert.equal(listNotifications(U1).length, prior + 1)

	setNotificationPreference(U1, "security", {
		email: false,
		inApp: false,
		discord: true,
	})
	setDiscordWebhook(U1, VALID_WEBHOOK)
	const mail = (await import("../../src/mail/smtp.ts")).sendMail
	setNotificationMailSender(mail)
	setNotificationDiscordSender(
		async () => new Response(null, { status: 204 })
	)
})

test("Discord delivery failure does not throw", async () => {
	setDiscordWebhook(U1, VALID_WEBHOOK)
	setNotificationPreference(U1, "security", {
		email: false,
		inApp: true,
		discord: true,
	})
	setNotificationDiscordSender(async () => {
		throw new Error("network down")
	})
	const sent = await sendDiscordNotification(VALID_WEBHOOK, {
		title: "T",
		body: "B",
		kind: "info",
	})
	assert.equal(sent, false)
	await notifyUser({
		userId: U1,
		source: "security",
		title: "Still ok",
		body: "x",
	})
	const mail = (await import("../../src/mail/smtp.ts")).sendMail
	setNotificationMailSender(mail)
	setNotificationDiscordSender(
		async () => new Response(null, { status: 204 })
	)
})
