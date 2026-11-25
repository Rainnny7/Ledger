import assert from "node:assert/strict"
import { test } from "node:test"
import { decrypt, encrypt } from "../../src/security/crypto.ts"

test("encrypt and decrypt round-trip", () => {
	const payload = { user: "u", pass: "p" }
	assert.deepEqual(decrypt(encrypt(payload)), payload)
})
