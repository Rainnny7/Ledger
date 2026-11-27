import assert from "node:assert/strict"
import { afterEach, before, test } from "node:test"
import { toCents } from "@ledger/shared/money"
import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { MAX_API_KEYS_PER_USER } from "../../src/api-keys/config.ts"
import { resetApiKeyFailures } from "../../src/api-keys/guard.ts"
import { auth } from "../../src/auth/index.ts"
import { db, runMigrations } from "../../src/db/connection.ts"
import {
	adminAudit,
	apikey,
	bankAccount,
	bankConnection,
	user,
} from "../../src/db/schema/index.ts"
import { apiGuards } from "../../src/http/api-guards.ts"
import { apiV1 } from "../../src/routes/api-v1.ts"

const USER_A = "00000000-0000-4000-8000-0000000000a2"
const USER_B = "00000000-0000-4000-8000-0000000000b2"
const USER_BANNED = "00000000-0000-4000-8000-0000000000c2"
const USER_TEMP = "00000000-0000-4000-8000-0000000000d2"
const USER_DEMO = "ledger-demo-api-key-test"

const app = new Elysia().use(apiGuards).use(apiV1)
const timestamp = new Date().toISOString()

before(() => {
	runMigrations()
	for (const id of [USER_A, USER_B, USER_BANNED, USER_TEMP, USER_DEMO]) {
		db.insert(user)
			.values({
				id,
				name: id,
				email: `${id}@example.com`,
				emailVerified: true,
				createdAt: timestamp,
				updatedAt: timestamp,
				mustChangePassword: id === USER_TEMP,
				banned: id === USER_BANNED,
			})
			.onConflictDoNothing()
			.run()
	}
	for (const [userId, balance] of [
		[USER_A, 111.11],
		[USER_B, 999.99],
	] as const) {
		db.insert(bankConnection)
			.values({
				id: `conn-${userId}`,
				userId,
				institution: "demo",
				label: "Bank",
				usernameMasked: "x",
			})
			.onConflictDoNothing()
			.run()
		db.insert(bankAccount)
			.values({
				id: `acct-${userId}`,
				connectionId: `conn-${userId}`,
				externalKey: `key-${userId}`,
				name: `Account of ${userId}`,
				type: "chequing",
				numberMasked: "****",
				currency: "CAD",
				balance: toCents(balance),
			})
			.onConflictDoNothing()
			.run()
	}
})

afterEach(() => {
	resetApiKeyFailures()
})

/** Makes a key for a user the way the server does, bypassing the session-only create route. */
async function makeKey(
	userId: string,
	options: { rateLimitMax?: number; expiresIn?: number } = {}
) {
	const created = await auth.api.createApiKey({
		body: { userId, name: "test", ...options },
	})
	return created as { id: string; key: string }
}

function get(path: string, headers: Record<string, string> = {}) {
	return app.handle(new Request(`http://localhost${path}`, { headers }))
}

const bearer = (key: string) => ({ authorization: `Bearer ${key}` })

test("a key reads only its owner's accounts and transactions", async () => {
	const keyA = await makeKey(USER_A)
	const keyB = await makeKey(USER_B)

	const accountsA = (await (
		await get("/api/v1/accounts", bearer(keyA.key))
	).json()) as { accounts: Array<{ id: string }> }
	assert.deepEqual(
		accountsA.accounts.map((account: { id: string }) => account.id),
		[`acct-${USER_A}`]
	)
	const accountsB = (await (
		await get("/api/v1/accounts", { "x-api-key": keyB.key })
	).json()) as { accounts: Array<{ id: string }> }
	assert.deepEqual(
		accountsB.accounts.map((account: { id: string }) => account.id),
		[`acct-${USER_B}`]
	)

	// Asking for someone else's account by id matches nothing.
	const stolen = await get(
		`/api/v1/transactions?accountId=acct-${USER_B}`,
		bearer(keyA.key)
	)
	assert.equal(stolen.status, 200)
	assert.equal(((await stolen.json()) as { total: number }).total, 0)
})

test("transactions are paged and the page size is capped", async () => {
	const key = await makeKey(USER_A)
	const tooBig = await get("/api/v1/transactions?limit=201", bearer(key.key))
	assert.equal(tooBig.status, 400)
	const page = await get("/api/v1/transactions?limit=5", bearer(key.key))
	assert.equal(page.status, 200)
	const body = (await page.json()) as {
		limit: number
		transactions: unknown[]
	}
	assert.equal(body.limit, 5)
	assert.ok(Array.isArray(body.transactions))
})

test("missing, malformed, unknown, revoked and expired keys all answer the same 401", async () => {
	const revoked = await makeKey(USER_A)
	db.delete(apikey).where(eq(apikey.id, revoked.id)).run()
	const expired = await makeKey(USER_A, { expiresIn: 60 * 60 * 24 })
	db.update(apikey)
		.set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
		.where(eq(apikey.id, expired.id))
		.run()
	const disabled = await makeKey(USER_A)
	db.update(apikey)
		.set({ enabled: false })
		.where(eq(apikey.id, disabled.id))
		.run()

	const bodies = new Set<string>()
	for (const headers of [
		{} as Record<string, string>,
		bearer("nonsense"),
		bearer(`ledger_${"x".repeat(64)}`),
		bearer(revoked.key),
		bearer(expired.key),
		bearer(disabled.key),
		{ "x-api-key": "a".repeat(500) },
	]) {
		const response = await get("/api/v1/accounts", headers)
		assert.equal(response.status, 401)
		bodies.add(await response.text())
	}
	assert.equal(bodies.size, 1)
})

test("a key past its rate limit gets 429 with Retry-After", async () => {
	const key = await makeKey(USER_A, { rateLimitMax: 2 })
	assert.equal((await get("/api/v1/accounts", bearer(key.key))).status, 200)
	assert.equal((await get("/api/v1/accounts", bearer(key.key))).status, 200)
	const limited = await get("/api/v1/accounts", bearer(key.key))
	assert.equal(limited.status, 429)
	assert.ok(Number(limited.headers.get("retry-after")) >= 1)
})

test("repeated bad keys from one address are turned away with 429", async () => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const response = await get("/api/v1/accounts", bearer("bad-key"))
		assert.equal(response.status, 401)
	}
	const blocked = await get("/api/v1/accounts", bearer("bad-key"))
	assert.equal(blocked.status, 429)
	assert.ok(blocked.headers.get("retry-after"))
})

test("keys of banned, temporary-password and demo users are refused", async () => {
	for (const userId of [USER_BANNED, USER_TEMP, USER_DEMO]) {
		const key = await makeKey(userId)
		const response = await get("/api/v1/accounts", bearer(key.key))
		assert.equal(response.status, 401, userId)
	}
})

test("a key stops working when its owner is banned later", async () => {
	const key = await makeKey(USER_B)
	assert.equal((await get("/api/v1/accounts", bearer(key.key))).status, 200)
	db.update(user).set({ banned: true }).where(eq(user.id, USER_B)).run()
	try {
		assert.equal(
			(await get("/api/v1/accounts", bearer(key.key))).status,
			401
		)
	} finally {
		db.update(user).set({ banned: false }).where(eq(user.id, USER_B)).run()
	}
})

test("unknown paths and non-GET methods answer 401 without a key and 404 with one", async () => {
	const key = await makeKey(USER_A)
	assert.equal((await get("/api/v1/nothing")).status, 401)
	assert.equal((await get("/api/v1/nothing", bearer(key.key))).status, 404)
	const post = await app.handle(
		new Request("http://localhost/api/v1/accounts", {
			method: "POST",
			headers: { ...bearer(key.key), "content-type": "application/json" },
		})
	)
	assert.equal(post.status, 404)
})

test("a key never acts as a session on Better Auth endpoints", async () => {
	const key = await makeKey(USER_A)
	for (const headers of [bearer(key.key), { "x-api-key": key.key }]) {
		const session = await auth.handler(
			new Request("http://localhost/api/auth/get-session", { headers })
		)
		assert.equal(await session.json(), null)

		const mint = await auth.handler(
			new Request("http://localhost/api/auth/api-key/create", {
				method: "POST",
				headers: { ...headers, "content-type": "application/json" },
				body: JSON.stringify({ name: "minted" }),
			})
		)
		assert.equal(mint.status, 401)

		const change = await auth.handler(
			new Request("http://localhost/api/auth/change-password", {
				method: "POST",
				headers: { ...headers, "content-type": "application/json" },
				body: JSON.stringify({
					currentPassword: "old-Password-1",
					newPassword: "New-Password-1234",
				}),
			})
		)
		assert.equal(change.status, 401)
	}
})

test("keys are created from a session: hashed, capped, audited and not editable", async () => {
	const origin = "http://localhost:3000"
	const signUp = await auth.handler(
		new Request(`${origin}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({
				name: "Key Tester",
				email: "key-tester@example.com",
				password: "Correct-Horse-Battery-9",
			}),
		})
	)
	assert.equal(signUp.status, 200)
	const cookie = signUp.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ")
	const call = (path: string, body: unknown, method = "POST") =>
		auth.handler(
			new Request(`${origin}/api/auth${path}`, {
				method,
				headers: {
					"content-type": "application/json",
					origin,
					cookie,
					"x-ledger-client-ip": "10.9.9.9",
				},
				body: method === "GET" ? undefined : JSON.stringify(body),
			})
		)

	const created = await call("/api-key/create", {
		name: "From settings",
		expiresIn: 60 * 60 * 24 * 30,
	})
	assert.equal(created.status, 200)
	const key = (await created.json()) as { id: string; key: string }
	assert.match(key.key, /^ledger_[A-Za-z0-9]{64}$/)
	const stored = db.select().from(apikey).where(eq(apikey.id, key.id)).get()
	assert.notEqual(stored?.key, key.key)
	assert.equal(stored?.rateLimitMax, 60)
	assert.equal(stored?.rateLimitEnabled, true)
	assert.equal((await get("/api/v1/accounts", bearer(key.key))).status, 200)

	// Clients cannot pick their own rate limit, and cannot skip the name.
	assert.equal(
		(await call("/api-key/create", { name: "x", rateLimitEnabled: false }))
			.status,
		400
	)
	assert.equal((await call("/api-key/create", {})).status, 400)
	assert.equal(
		(await call("/api-key/update", { keyId: key.id, name: "renamed" }))
			.status,
		404
	)

	const audited = db
		.select()
		.from(adminAudit)
		.where(eq(adminAudit.detail, "From settings"))
		.all()
	assert.equal(audited.length, 1)
	assert.equal(audited[0]?.action, "Created API key")
	assert.equal(audited[0]?.actorEmail, "key-tester@example.com")

	const listed = (await (
		await call("/api-key/list", null, "GET")
	).json()) as { apiKeys: Array<Record<string, unknown>> }
	assert.equal(listed.apiKeys.length, 1)
	assert.equal("key" in listed.apiKeys[0], false)

	for (let keyNumber = 1; keyNumber < MAX_API_KEYS_PER_USER; keyNumber += 1) {
		assert.equal(
			(await call("/api-key/create", { name: `key ${keyNumber}` }))
				.status,
			200
		)
	}
	assert.equal(
		(await call("/api-key/create", { name: "one too many" })).status,
		400
	)

	const removed = await call("/api-key/delete", { keyId: key.id })
	assert.equal(removed.status, 200)
	assert.equal(
		db
			.select()
			.from(adminAudit)
			.where(eq(adminAudit.action, "Deleted API key"))
			.all().length,
		1
	)
	assert.equal((await get("/api/v1/accounts", bearer(key.key))).status, 401)
})
