/** Data directory path, env parsing, and the lazily loaded app secret. */
import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

/** Public export for routes and tests. */
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data")
mkdirSync(DATA_DIR, { recursive: true })

/** Empty or whitespace-only env values are treated as unset. */
export function nonEmpty(value: string | undefined): string | undefined {
	const trimmed = value?.trim()
	return trimmed ? trimmed : undefined
}

/** Parses a positive integer env var or throws at startup. */
export function parsePositiveInt(
	raw: string | undefined,
	fallback: number,
	name: string
): number {
	const text = nonEmpty(raw)
	if (text === undefined) {
		return fallback
	}
	const parsed = Number.parseInt(text, 10)
	if (!Number.isFinite(parsed) || parsed < 1 || String(parsed) !== text) {
		throw new Error(
			`${name} must be a positive integer (got ${JSON.stringify(raw)})`
		)
	}
	return parsed
}

/**
 * `true` or `1` → one trusted hop; a positive integer → that many hops from the
 * right of X-Forwarded-For; unset/false → do not trust the header.
 */
export function parseTrustProxy(raw: string | undefined): number {
	const text = nonEmpty(raw)?.toLowerCase()
	if (!text || text === "false" || text === "0") {
		return 0
	}
	if (text === "true") {
		return 1
	}
	const hops = Number.parseInt(text, 10)
	if (!Number.isFinite(hops) || hops < 1) {
		throw new Error(
			`TRUST_PROXY must be true, false, or a positive hop count (got ${JSON.stringify(raw)})`
		)
	}
	return hops
}

/**
 * A secret used both for Better Auth session signing and for encrypting
 * saved bank credentials. If it isn't provided via env we generate one once
 * and keep it in the data directory so restarts don't log everyone out.
 */
function loadSecret(): string {
	const fromEnv = nonEmpty(process.env.APP_SECRET)
	if (fromEnv) {
		// It signs sessions and keys the bank-credential encryption, so a guessable one undoes both.
		// Not fatal: changing it signs everyone out and makes saved bank details unreadable.
		if (fromEnv.length < 32) {
			console.warn(
				"[security] APP_SECRET is shorter than 32 characters; use a random one (openssl rand -base64 32)."
			)
		}
		return fromEnv
	}
	const file = path.join(DATA_DIR, ".secret")
	if (existsSync(file)) {
		return readFileSync(file, "utf8").trim()
	}
	const secret = randomBytes(32).toString("base64url")
	writeFileSync(file, secret, { mode: 0o600 })
	return secret
}

const defaultAppUrl = "http://localhost:5173"

/** Process env-derived config (ports, URLs, secrets) used across the server. */
export const env = {
	port: parsePositiveInt(process.env.PORT, 3001, "PORT"),
	appUrl: nonEmpty(process.env.APP_URL) ?? defaultAppUrl,
	/**
	 * The address other people reach Ledger on: invoice share links, PayPal's return page and its
	 * webhooks. Defaults to APP_URL. PayPal only delivers webhooks to a public https:// address.
	 */
	publicUrl: (
		nonEmpty(process.env.PUBLIC_URL) ??
		nonEmpty(process.env.APP_URL) ??
		defaultAppUrl
	).replace(/\/+$/, ""),
	secret: loadSecret(),
	/** Set TD_HEADLESS=false to watch the browser while it logs into EasyWeb. */
	tdHeadless: process.env.TD_HEADLESS !== "false",
	/** New accounts can only be created while there are none, unless ALLOW_REGISTRATION=true. */
	allowRegistration: process.env.ALLOW_REGISTRATION === "true",
	/** Trusted X-Forwarded-For hops (0 = off). See parseTrustProxy. */
	trustProxyHops: parseTrustProxy(process.env.TRUST_PROXY),
	/** Daily database copies to keep in DATA_DIR/backups. */
	backupsKept: parsePositiveInt(process.env.BACKUPS_KEPT, 14, "BACKUPS_KEPT"),
	/** Live exchange rates (Coinbase's public rates by default). Set FX_LIVE_URL= (empty) to use only the ECB's daily rates. */
	fxLiveUrl:
		nonEmpty(process.env.FX_LIVE_URL) ??
		"https://api.coinbase.com/v2/exchange-rates?currency=USD",
	/** The fallback when live rates fail: Frankfurter's daily ECB reference rates. */
	fxRatesUrl:
		nonEmpty(process.env.FX_RATES_URL) ??
		"https://api.frankfurter.dev/v1/latest",
	/** GitHub `owner/repo` checked for newer releases (private repos fail quietly). */
	updateRepo: nonEmpty(process.env.UPDATE_REPO) ?? "rainnny7/ledger",
	/** Set UPDATE_CHECK=false to skip polling GitHub. */
	updateCheck: process.env.UPDATE_CHECK !== "false",
}
