import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	scryptSync,
} from "node:crypto"
import { env } from "../config/env.ts"

const SCRYPT_SALT = Buffer.from("ledger-bank-data-v2", "utf8")
const KEY_LEN = 32
const MIGRATION_KEY = "crypto_scrypt_v2"
const TAG_LEN = 16

function deriveKey(secret: string): Buffer {
	return scryptSync(secret, SCRYPT_SALT, KEY_LEN)
}

/** Previous single-round SHA-256 derivation; only used during the one-time migration. */
function legacyKey(secret: string): Buffer {
	return createHash("sha256").update(`bank-data:${secret}`).digest()
}

const key = deriveKey(env.secret)

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

/** Re-encrypts every *_enc column from the legacy key to scrypt (once per database). */
export async function migrateCryptoAtRest() {
	const { db, getSetting, setSetting } = await import("../db/connection.ts")
	if (getSetting(MIGRATION_KEY) === "1") {
		return
	}
	const oldKey = legacyKey(env.secret)
	const newKey = key
	db.exec("BEGIN")
	try {
		const migrateCol = (table: string, column: string, idColumn = "id") => {
			const rows = db
				.prepare(
					`SELECT ${idColumn} AS id, ${column} AS enc FROM ${table} WHERE ${column} IS NOT NULL`
				)
				.all() as { id: string; enc: string }[]
			const upd = db.prepare(
				`UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ?`
			)
			for (const row of rows) {
				const plain = decryptWithKey(oldKey, row.enc)
				upd.run(encryptWithKey(newKey, plain), row.id)
			}
		}
		migrateCol("bank_connection", "credentials_enc")
		migrateCol("bank_connection", "browser_state_enc")
		migrateCol("bank_account", "details_enc")
		setSetting(MIGRATION_KEY, "1")
		db.exec("COMMIT")
	} catch (error) {
		db.exec("ROLLBACK")
		throw error
	}
}

/** Test hook: legacy encrypt for migration round-trip tests. */
export function legacyEncrypt(value: unknown, secret: string): string {
	return encryptWithKey(legacyKey(secret), value)
}
