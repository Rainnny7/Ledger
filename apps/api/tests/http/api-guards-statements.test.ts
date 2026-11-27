import assert from "node:assert/strict"
import { test } from "node:test"
import { mock } from "bun:test"
import { Elysia } from "elysia"

let importCalled = false

mock.module("../../src/auth/index.ts", () => ({
	auth: {
		api: {
			getSession: async () => null,
		},
	},
	aiChatAvailable: () => false,
}))

mock.module("../../src/banks/statements.ts", () => ({
	importStatements: async () => {
		importCalled = true
		return { files: [], accounts: [] }
	},
	collectPdfs: () => ({ pdfs: [], rejected: [] }),
}))

const { apiGuards } = await import("../../src/http/api-guards.ts")
const { banks } = await import("../../src/routes/banks.ts")

const app = new Elysia({ prefix: "/api/banks" }).use(apiGuards).use(banks)

test("anonymous multipart statement upload is rejected before import", async () => {
	importCalled = false
	const boundary = "----ledger-test"
	const filePayload = "x".repeat(1024 * 1024)
	const body = [
		`--${boundary}`,
		'Content-Disposition: form-data; name="files"; filename="big.pdf"',
		"Content-Type: application/pdf",
		"",
		filePayload,
		`--${boundary}--`,
		"",
	].join("\r\n")
	const response = await app.handle(
		new Request("http://localhost/api/banks/statements", {
			method: "POST",
			headers: {
				"content-type": `multipart/form-data; boundary=${boundary}`,
				"content-length": String(Buffer.byteLength(body)),
			},
			body,
		})
	)
	assert.equal(response.status, 401)
	const json = (await response.json()) as { error: string }
	assert.equal(json.error, "Unauthorized")
	assert.equal(importCalled, false)
})
