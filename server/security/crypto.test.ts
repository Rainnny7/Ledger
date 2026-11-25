import assert from "node:assert/strict"
import { test } from "node:test"
import {
	decrypt,
	decryptWithKey,
	encrypt,
	encryptWithKey,
	legacyEncrypt,
} from "./crypto.ts"
import { createHash, scryptSync } from "node:crypto"

const secret = "a".repeat(40)

function legacyKey(s: string) {
	return createHash("sha256").update(`bank-data:${s}`).digest()
}

function scryptKey(s: string) {
	return scryptSync(s, Buffer.from("ledger-bank-data-v2", "utf8"), 32)
}

test("encrypt and decrypt round-trip", () => {
	const payload = { user: "u", pass: "p" }
	assert.deepEqual(decrypt(encrypt(payload)), payload)
})

test("legacy ciphertext re-encrypts to the scrypt key", () => {
	const plain = { clientId: "id", secret: "s" }
	const legacyPayload = legacyEncrypt(plain, secret)
	const newKey = scryptKey(secret)
	const oldKey = legacyKey(secret)
	const migrated = encryptWithKey(
		newKey,
		decryptWithKey(oldKey, legacyPayload)
	)
	assert.deepEqual(decryptWithKey(newKey, migrated), plain)
})
