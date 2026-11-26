import assert from "node:assert/strict"
import { before, test } from "node:test"
import { Elysia } from "elysia"

const { db, runMigrations } = await import("../../src/db/connection.ts")
const { user } = await import("../../src/db/schema/index.ts")
const { apiErrors } = await import("../../src/http/errors.ts")
const { authLookup } = await import("../../src/auth/lookup.ts")
const { verifyTurnstileToken } = await import("../../src/auth/captcha.ts")

before(() => {
	runMigrations()
	const now = new Date().toISOString()
	for (const email of ["person@example.com", "demo@ledger.invalid"]) {
		db.insert(user)
			.values({
				id: email,
				name: email,
				email,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()
			.run()
	}
})

/** A fresh app (and so a fresh rate limit) per test. */
function makeApp(options: {
	registrationOpen?: boolean
	verifyCaptcha?: (token: string, ip: string | null) => Promise<boolean>
}) {
	const app = new Elysia().use(apiErrors).use(
		authLookup({
			registrationOpen: () => options.registrationOpen ?? true,
			verifyCaptcha: options.verifyCaptcha,
		})
	)
	return (email: unknown, headers: Record<string, string> = {}) =>
		app.handle(
			new Request("http://localhost/api/auth/lookup", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-ledger-client-ip": "10.0.0.1",
					...headers,
				},
				body: JSON.stringify({ email }),
			})
		)
}

test("lookup reports an existing account, ignoring case and spaces", async () => {
	const lookup = makeApp({})
	const response = await lookup("  Person@Example.com ")
	assert.equal(response.status, 200)
	assert.deepEqual(await response.json(), {
		exists: true,
		registrationOpen: true,
	})
})

test("lookup reports an unknown email as free to register", async () => {
	const response = await makeApp({})("nobody@example.com")
	assert.deepEqual(await response.json(), {
		exists: false,
		registrationOpen: true,
	})
})

test("lookup reports when sign-ups are closed", async () => {
	const response = await makeApp({ registrationOpen: false })(
		"nobody@example.com"
	)
	assert.deepEqual(await response.json(), {
		exists: false,
		registrationOpen: false,
	})
})

test("lookup treats demo emails as having no account", async () => {
	const response = await makeApp({})("demo@ledger.invalid")
	assert.equal(((await response.json()) as { exists: boolean }).exists, false)
})

test("lookup rejects implausible emails", async () => {
	assert.equal((await makeApp({})("not an email")).status, 400)
	assert.equal((await makeApp({})(42)).status, 400)
})

test("lookup is rate limited per address", async () => {
	const lookup = makeApp({})
	for (let attempt = 0; attempt < 10; attempt++) {
		assert.equal((await lookup("nobody@example.com")).status, 200)
	}
	assert.equal((await lookup("nobody@example.com")).status, 429)
	// Another address has its own allowance.
	const other = await lookup("nobody@example.com", {
		"x-ledger-client-ip": "10.0.0.2",
	})
	assert.equal(other.status, 200)
})

test("lookup needs a captcha token the verifier accepts", async () => {
	const seen: Array<[string, string | null]> = []
	const lookup = makeApp({
		verifyCaptcha: async (token, ip) => {
			seen.push([token, ip])
			return token === "good"
		},
	})
	assert.equal((await lookup("person@example.com")).status, 403)
	assert.equal(
		(await lookup("person@example.com", { "x-captcha-response": "bad" }))
			.status,
		403
	)
	const accepted = await lookup("person@example.com", {
		"x-captcha-response": "good",
	})
	assert.equal(accepted.status, 200)
	assert.deepEqual(seen, [
		["bad", "10.0.0.1"],
		["good", "10.0.0.1"],
	])
})

test("verifyTurnstileToken posts the secret, token and address to Cloudflare", async () => {
	let request: { url: string; body: Record<string, string> } | null = null
	const accepting = (async (url: string, init: RequestInit) => {
		request = { url, body: JSON.parse(String(init.body)) }
		return Response.json({ success: true })
	}) as unknown as typeof fetch
	assert.equal(
		await verifyTurnstileToken("secret", "token", "1.2.3.4", accepting),
		true
	)
	assert.equal(
		request!.url,
		"https://challenges.cloudflare.com/turnstile/v0/siteverify"
	)
	assert.deepEqual(request!.body, {
		secret: "secret",
		response: "token",
		remoteip: "1.2.3.4",
	})
})

test("verifyTurnstileToken fails closed on rejection, bad status or network error", async () => {
	const rejecting = (async () =>
		Response.json({ success: false })) as unknown as typeof fetch
	const unavailable = (async () =>
		new Response("nope", { status: 500 })) as unknown as typeof fetch
	const offline = (async () => {
		throw new Error("offline")
	}) as unknown as typeof fetch
	const quiet = console.error
	console.error = () => {}
	try {
		assert.equal(
			await verifyTurnstileToken("s", "t", null, rejecting),
			false
		)
		assert.equal(
			await verifyTurnstileToken("s", "t", null, unavailable),
			false
		)
		assert.equal(await verifyTurnstileToken("s", "t", null, offline), false)
	} finally {
		console.error = quiet
	}
})
