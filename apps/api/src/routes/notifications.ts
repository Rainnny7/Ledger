import { Elysia } from "elysia"
import { z } from "zod"
import { id, jsonBody } from "../http/validation.ts"
import {
	getDiscordWebhook,
	parseDiscordWebhookUrl,
	sendDiscordNotification,
	setDiscordWebhook,
} from "../notifications/discord.ts"
import {
	clearAll,
	countUnread,
	deleteNotification,
	getNotificationPreferences,
	listNotifications,
	markAllRead,
	markRead,
	markUnread,
	NOTIFICATION_SOURCES,
	setNotificationPreference,
} from "../notifications/service.ts"
import { sessionUser } from "./session.ts"

const idParam = z.object({ id: id })

const preferenceBody = z.object({
	source: z.enum(NOTIFICATION_SOURCES),
	email: z.boolean(),
	inApp: z.boolean(),
	discord: z.boolean(),
})

const discordWebhookBody = z.object({
	url: z.string().max(500),
})

/** Logged-in notification inbox (`/api/notifications/*`). */
export const notifications = new Elysia({
	name: "notifications",
	prefix: "/api/notifications",
}).use(sessionUser)

notifications.get("/", ({ user }) => ({
	items: listNotifications(user.id),
	unreadCount: countUnread(user.id),
}))

notifications.get("/preferences", ({ user }) => ({
	preferences: getNotificationPreferences(user.id),
}))

notifications.put(
	"/preferences",
	({ user, body }) => {
		setNotificationPreference(user.id, body.source, {
			email: body.email,
			inApp: body.inApp,
			discord: body.discord,
		})
		return { preferences: getNotificationPreferences(user.id) }
	},
	{ body: jsonBody(preferenceBody) }
)

notifications.post(
	"/:id/read",
	({ user, params }) => {
		markRead(user.id, params.id)
		return { ok: true }
	},
	{ params: idParam }
)

notifications.post(
	"/:id/unread",
	({ user, params }) => {
		markUnread(user.id, params.id)
		return { ok: true }
	},
	{ params: idParam }
)

notifications.post("/read-all", ({ user }) => {
	markAllRead(user.id)
	return { ok: true }
})

notifications.delete(
	"/:id",
	({ user, params }) => {
		deleteNotification(user.id, params.id)
		return { ok: true }
	},
	{ params: idParam }
)

notifications.delete("/", ({ user }) => {
	clearAll(user.id)
	return { ok: true }
})

notifications.get("/discord", ({ user }) => ({
	configured: getDiscordWebhook(user.id) !== null,
}))

notifications.put(
	"/discord",
	({ user, body, status }) => {
		const url = parseDiscordWebhookUrl(body.url)
		if (!url) {
			return status(400, {
				error: "Enter a valid Discord webhook URL (https://discord.com/api/webhooks/…).",
			})
		}
		setDiscordWebhook(user.id, url)
		return { configured: true }
	},
	{ body: jsonBody(discordWebhookBody) }
)

notifications.delete("/discord", ({ user }) => {
	setDiscordWebhook(user.id, null)
	return { configured: false }
})

notifications.post("/discord/test", async ({ user, status }) => {
	const webhookUrl = getDiscordWebhook(user.id)
	if (!webhookUrl) {
		return status(400, {
			error: "Save a Discord webhook URL before sending a test.",
		})
	}
	const ok = await sendDiscordNotification(webhookUrl, {
		title: "Ledger test notification",
		body: "If you see this embed, Discord delivery is working.",
		kind: "success",
		href: "/settings",
	})
	return { ok }
})
