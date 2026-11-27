import assert from "node:assert/strict"
import { test } from "node:test"
import { signToken, verifyToken } from "../../src/security/signed-token.ts"

const SECRET = "test-secret-with-plenty-of-length-0123456789"

test("a signed token verifies back to its user", () => {
	const token = signToken("digest-unsubscribe", "user-1", SECRET)
	assert.equal(verifyToken("digest-unsubscribe", token, SECRET), "user-1")
})

test("a token signed with another secret is rejected", () => {
	const token = signToken("digest-unsubscribe", "user-1", "other-secret")
	assert.equal(verifyToken("digest-unsubscribe", token, SECRET), null)
})

test("swapping the user id invalidates the signature", () => {
	const [, signature] = signToken(
		"digest-unsubscribe",
		"user-1",
		SECRET
	).split(".")
	const forged = `${Buffer.from("user-2").toString("base64url")}.${signature}`
	assert.equal(verifyToken("digest-unsubscribe", forged, SECRET), null)
})

test("malformed tokens are rejected", () => {
	for (const token of ["", "abc", "a.b.c", ".", "a.", ".b"]) {
		assert.equal(verifyToken("digest-unsubscribe", token, SECRET), null)
	}
})

test("the default secret is the app secret", () => {
	const token = signToken("digest-unsubscribe", "user-1")
	assert.equal(verifyToken("digest-unsubscribe", token), "user-1")
})
