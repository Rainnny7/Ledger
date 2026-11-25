import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { env } from "./env.ts"

// Derive a dedicated 256-bit key for data-at-rest encryption from the app secret.
const key = createHash("sha256").update(`bank-data:${env.secret}`).digest()

export function encrypt(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [iv, tag, data].map((b) => b.toString("base64url")).join(".")
}

export function decrypt<T>(payload: string): T {
  const [iv, tag, data] = payload
    .split(".")
    .map((s) => Buffer.from(s, "base64url"))
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const out = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(out.toString("utf8")) as T
}
