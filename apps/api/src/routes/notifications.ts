import { Elysia } from "elysia"
import { z } from "zod"
import { id } from "../http/validation.ts"
import {
	clearAll,
	countUnread,
	deleteNotification,
	listNotifications,
	markAllRead,
	markRead,
} from "../notifications/service.ts"
import { sessionUser } from "./session.ts"

const idParam = z.object({ id: id })

/** Logged-in notification inbox (`/api/notifications/*`). */
export const notifications = new Elysia({
	name: "notifications",
	prefix: "/api/notifications",
}).use(sessionUser)

notifications.get("/", ({ user }) => ({
	items: listNotifications(user.id),
	unreadCount: countUnread(user.id),
}))

notifications.post(
	"/:id/read",
	({ user, params }) => {
		markRead(user.id, params.id)
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
