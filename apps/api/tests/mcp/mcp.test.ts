import assert from "node:assert/strict"
import { before, test } from "node:test"
import { toCents } from "@ledger/shared/money"
import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { db, runMigrations, setSetting } from "../../src/db/connection.ts"
import {
	bankAccount,
	bankConnection,
	mcpToken,
	user,
} from "../../src/db/schema/index.ts"
import { apiGuards } from "../../src/http/api-guards.ts"
import { mcpRoutes } from "../../src/mcp/mcp-route.ts"
import {
	createMcpToken,
	hashMcpToken,
	listMcpTokens,
	MAX_MCP_TOKENS_PER_USER,
	resolveMcpToken,
	revokeMcpToken,
} from "../../src/mcp/tokens.ts"

const USER_A = "00000000-0000-4000-8000-0000000000a1"
const USER_B = "00000000-0000-4000-8000-0000000000b1"
const USER_TEMP = "00000000-0000-4000-8000-0000000000c1"

const app = new Elysia().use(apiGuards).use(mcpRoutes)

const timestamp = new Date().toISOString()

before(() => {
	runMigrations()
	for (const id of [USER_A, USER_B, USER_TEMP]) {
		db.insert(user)
			.values({
				id,
				name: id,
				email: `${id}@example.com`,
				emailVerified: true,
				createdAt: timestamp,
				updatedAt: timestamp,
				mustChangePassword: id === USER_TEMP,
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
	setSetting("mcp_enabled", "true")
})

/** POSTs one JSON-RPC message to /api/mcp the way a real MCP client does. */
function rpc(
	token: string | null,
	body: unknown,
	headers: Record<string, string> = {}
) {
	return app.handle(
		new Request("http://localhost/api/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...(token ? { authorization: `Bearer ${token}` } : {}),
				...headers,
			},
			body: JSON.stringify(body),
		})
	)
}

const initializeMessage = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "test", version: "0" },
	},
}

test("tokens are stored hashed, scoped to their owner, and revocable", () => {
	const created = createMcpToken(USER_A, "Laptop")
	assert.ok(created)
	assert.match(created.token, /^ledger_mcp_[A-Za-z0-9_-]{43}$/)
	assert.equal(created.row.lastFour, created.token.slice(-4))
	const stored = db
		.select()
		.from(mcpToken)
		.where(eq(mcpToken.id, created.row.id))
		.get()
	assert.equal(stored?.tokenHash, hashMcpToken(created.token))
	assert.notEqual(stored?.tokenHash, created.token)
	assert.deepEqual(resolveMcpToken(created.token), {
		tokenId: created.row.id,
		userId: USER_A,
	})
	assert.equal(listMcpTokens(USER_B).length, 0)
	assert.equal(revokeMcpToken(USER_B, created.row.id), false)
	assert.equal(revokeMcpToken(USER_A, created.row.id), true)
	assert.equal(resolveMcpToken(created.token), "invalid")
})

test("deleting a user removes their tokens", () => {
	const doomed = "00000000-0000-4000-8000-0000000000d1"
	db.insert(user)
		.values({
			id: doomed,
			name: "d",
			email: "d@example.com",
			emailVerified: true,
			createdAt: timestamp,
			updatedAt: timestamp,
		})
		.run()
	const created = createMcpToken(doomed, "x")
	assert.ok(created)
	db.delete(user).where(eq(user.id, doomed)).run()
	assert.equal(resolveMcpToken(created.token), "invalid")
})

test("a user may hold only a limited number of tokens", () => {
	const holder = "00000000-0000-4000-8000-0000000000e1"
	db.insert(user)
		.values({
			id: holder,
			name: "holder",
			email: "holder@example.com",
			emailVerified: true,
			createdAt: timestamp,
			updatedAt: timestamp,
		})
		.run()
	for (let i = 0; i < MAX_MCP_TOKENS_PER_USER; i += 1) {
		assert.ok(createMcpToken(holder, `t${i}`))
	}
	assert.equal(createMcpToken(holder, "one too many"), null)
})

test("users who must change their password are refused", async () => {
	const created = createMcpToken(USER_TEMP, "temp")
	assert.ok(created)
	assert.equal(resolveMcpToken(created.token), "password-change-required")
	assert.equal((await rpc(created.token, initializeMessage)).status, 403)
})

test("flag off answers 503, non-POST answers 405", async () => {
	const created = createMcpToken(USER_A, "flag")
	assert.ok(created)
	setSetting("mcp_enabled", "false")
	const off = await rpc(created.token, initializeMessage)
	assert.equal(off.status, 503)
	setSetting("mcp_enabled", "true")
	for (const method of ["GET", "DELETE"]) {
		const response = await app.handle(
			new Request("http://localhost/api/mcp", { method })
		)
		assert.equal(response.status, 405)
		assert.equal(response.headers.get("content-type"), "application/json")
	}
})

test("missing, malformed and unknown tokens answer 401", async () => {
	for (const token of [null, "nope", "ledger_mcp_" + "A".repeat(43)]) {
		const response = await rpc(token, initializeMessage)
		assert.equal(response.status, 401)
	}
})

test("oversized bodies are refused before parsing", async () => {
	const created = createMcpToken(USER_A, "big")
	assert.ok(created)
	const response = await rpc(created.token, {
		...initializeMessage,
		padding: "x".repeat(70 * 1024),
	})
	assert.equal(response.status, 413)
})

test("initialize, tools/list and tools/call work end to end with user scoping", async () => {
	const tokenA = createMcpToken(USER_A, "a")
	const tokenB = createMcpToken(USER_B, "b")
	assert.ok(tokenA && tokenB)

	const init = await rpc(tokenA.token, initializeMessage)
	assert.equal(init.status, 200)
	const initBody = (await init.json()) as {
		result: { serverInfo: { name: string }; instructions: string }
	}
	assert.equal(initBody.result.serverInfo.name, "ledger")
	assert.ok(initBody.result.instructions.length > 0)

	const list = await rpc(tokenA.token, {
		jsonrpc: "2.0",
		id: 2,
		method: "tools/list",
	})
	const listBody = (await list.json()) as {
		result: {
			tools: {
				name: string
				annotations: { readOnlyHint: boolean }
			}[]
		}
	}
	assert.deepEqual(
		listBody.result.tools.map((tool) => tool.name).toSorted(),
		[
			"financialOverview",
			"getBudgets",
			"getGoals",
			"getSubscriptions",
			"listAccounts",
			"searchTransactions",
			"spendingSummary",
		]
	)
	assert.ok(
		listBody.result.tools.every((tool) => tool.annotations.readOnlyHint)
	)

	for (const [token, balance, other] of [
		[tokenA.token, 111.11, 999.99],
		[tokenB.token, 999.99, 111.11],
	] as const) {
		const call = await rpc(token, {
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: { name: "listAccounts", arguments: {} },
		})
		assert.equal(call.status, 200)
		const callBody = (await call.json()) as {
			result: { content: { text: string }[]; isError?: boolean }
		}
		assert.notEqual(callBody.result.isError, true)
		const text = callBody.result.content[0].text
		assert.ok(text.includes(String(balance)))
		assert.ok(!text.includes(String(other)))
	}

	const invalid = await rpc(tokenA.token, {
		jsonrpc: "2.0",
		id: 4,
		method: "tools/call",
		params: {
			name: "spendingSummary",
			arguments: { from: "not-a-date", until: "2024-01-01" },
		},
	})
	const invalidBody = (await invalid.json()) as {
		result?: { isError?: boolean }
		error?: unknown
	}
	assert.ok(invalidBody.result?.isError === true || invalidBody.error)
})

test("a revoked token stops working immediately", async () => {
	const created = createMcpToken(USER_A, "short-lived")
	assert.ok(created)
	assert.equal((await rpc(created.token, initializeMessage)).status, 200)
	revokeMcpToken(USER_A, created.row.id)
	assert.equal((await rpc(created.token, initializeMessage)).status, 401)
})
