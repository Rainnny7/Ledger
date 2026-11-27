import { Elysia } from "elysia"
import { z } from "zod"
import { id, jsonBody } from "../http/validation.ts"
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
