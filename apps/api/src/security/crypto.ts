import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
} from "node:crypto"
import { env } from "../config/env.ts"

const SCRYPT_SALT = Buffer.from("ledger-bank-data-v2", "utf8")
const KEY_LEN = 32
const TAG_LEN = 16

function deriveKey(secret: string): Buffer {
	return scryptSync(secret, SCRYPT_SALT, KEY_LEN)
}

const key = deriveKey(env.APP_SECRET)

/** Encrypt JSON with AES-GCM using an explicit key buffer (migration/tests). */
export function encryptWithKey(encryptionKey: Buffer, value: unknown): string {
	const iv = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv, {
		authTagLength: TAG_LEN,
	})
	const data = Buffer.concat([
		cipher.update(JSON.stringify(value), "utf8"),
		cipher.final(),
	])
	const tag = cipher.getAuthTag()
	return [iv, tag, data].map((chunk) => chunk.toString("base64url")).join(".")
}

/** Decrypt a JSON blob encrypted with {@link encryptWithKey}. */
export function decryptWithKey<T>(encryptionKey: Buffer, payload: string): T {
	const [iv, tag, data] = payload
		.split(".")
		.map((part) => Buffer.from(part, "base64url"))
	const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv, {
		authTagLength: TAG_LEN,
	})
	decipher.setAuthTag(tag)
	const out = Buffer.concat([decipher.update(data), decipher.final()])
	return JSON.parse(out.toString("utf8")) as T
}

/** Encrypt sensitive values for SQLite at-rest columns. */
export function encrypt(value: unknown): string {
	return encryptWithKey(key, value)
}

/** Decrypt an at-rest value written by {@link encrypt}. */
export function decrypt<T>(payload: string): T {
	return decryptWithKey<T>(key, payload)
}
