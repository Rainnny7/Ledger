import assert from "node:assert/strict"
import { before, test } from "node:test"
import { mock } from "bun:test"
import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db, runMigrations } from "../../src/db/connection.ts"
import { user } from "../../src/db/schema/index.ts"

const USER = "00000000-0000-4000-8000-0000000000f1"

mock.module("../../src/auth/index.ts", () => ({
	auth: {
		api: {
			getSession: async ({ headers }: { headers: Headers }) => {
				const id = headers.get("x-user")
				if (!id) {
					return null
				}
				const found = db
					.select({ id: user.id, name: user.name, email: user.email })
					.from(user)
					.where(eq(user.id, id))
					.get()
				return found ? { user: found } : null
			},
		},
		$Infer: { Session: { user: {} } },
	},
	aiChatAvailable: () => true,
}))

const { sessionUser } = await import("../../src/routes/session.ts")
const { chatRoutes } = await import("../../src/chat/chat-route.ts")

const app = new Elysia({ prefix: "/api/banks" })
	.use(sessionUser)
	.use(chatRoutes)

before(() => {
	runMigrations()
	const now = new Date().toISOString()
	db.insert(user)
		.values({
			id: USER,
			name: "chat-user",
			email: "chat-user@example.com",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing()
		.run()
})

test("chat rejects a file part with an http URL", async () => {
	const response = await app.handle(
		new Request("http://localhost/api/banks/chat", {
			method: "POST",
			headers: {
				"x-user": USER,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "file",
								url: "http://127.0.0.1:9/internal",
								mediaType: "text/plain",
							},
						],
					},
				],
			}),
		})
	)
	assert.ok(response.status >= 400 && response.status < 500)
})
