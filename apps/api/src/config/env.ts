/** Validated environment for the API, parsed once at startup with @t3-oss/env-core. */
import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/** Where the database, backups and generated secret live when DATA_DIR is unset: the repo's `data/`. */
const DEFAULT_DATA_DIR = path.resolve(import.meta.dirname, "../../../../data")

/**
 * `true` or `1` → one trusted hop; a positive integer → that many hops from the
 * right of X-Forwarded-For; unset/false → do not trust the header.
 */
export const trustProxyHops = z
	.string()
	.default("false")
	.transform((raw, context) => {
		const text = raw.trim().toLowerCase()
		if (text === "false" || text === "0") {
			return 0
		}
		if (text === "true") {
			return 1
		}
		const hops = Number.parseInt(text, 10)
		if (!/^\d+$/.test(text) || hops < 1) {
			context.addIssue({
				code: "custom",
				message: "must be true, false, or a positive hop count",
			})
			return z.NEVER
		}
		return hops
	})

/**
 * The secret signs Better Auth sessions and encrypts saved bank credentials. If it isn't provided via
 * env we generate one once and keep it in the data directory so restarts don't log everyone out.
 */
function loadSecret(dataDir: string): string {
	const fromEnv = process.env.APP_SECRET?.trim()
	if (fromEnv) {
		// A guessable secret undoes both uses. Not fatal: changing it signs everyone out and makes
		// saved bank details unreadable.
		if (fromEnv.length < 32) {
			console.warn(
				"[security] APP_SECRET is shorter than 32 characters; use a random one (openssl rand -base64 32)."
			)
		}
		return fromEnv
	}
	const file = path.join(dataDir, ".secret")
	if (existsSync(file)) {
		return readFileSync(file, "utf8").trim()
	}
	const secret = randomBytes(32).toString("base64url")
	writeFileSync(file, secret, { mode: 0o600 })
	return secret
}

const dataDir = path.resolve(process.env.DATA_DIR?.trim() || DEFAULT_DATA_DIR)
mkdirSync(dataDir, { recursive: true })

const stringBoolean = (fallback: boolean) => z.stringbool().default(fallback)

/** Process env-derived config (ports, URLs, secrets) used across the server. */
export const env = createEnv({
	server: {
		PORT: z.coerce.number().int().positive().default(3001),
		APP_URL: z.url().default("http://localhost:5173"),
		/**
		 * The address other people reach Ledger on: invoice share links, PayPal's return page and its
		 * webhooks. Defaults to APP_URL. PayPal only delivers webhooks to a public https:// address.
		 */
		PUBLIC_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
		APP_SECRET: z.string().min(1),
		DATA_DIR: z.string().min(1),
		/** Set TD_HEADLESS=false to watch the browser while it logs into EasyWeb. */
		TD_HEADLESS: stringBoolean(true),
		/** An installed browser to use instead of Playwright's Chromium, e.g. `chrome` or `msedge`. */
		TD_BROWSER_CHANNEL: z.string().optional(),
		/** Run Chromium without its sandbox, for slim Docker images without user namespaces. */
		TD_BROWSER_NO_SANDBOX: stringBoolean(false),
		/** New accounts can only be created while there are none, unless ALLOW_REGISTRATION=true. */
		ALLOW_REGISTRATION: stringBoolean(false),
		/** Trusted X-Forwarded-For hops (0 = off). */
		TRUST_PROXY: trustProxyHops,
		/** Daily database copies to keep in DATA_DIR/backups. */
		BACKUPS_KEPT: z.coerce.number().int().positive().default(14),
		/** Live exchange rates (Coinbase's public rates by default). Set to `off` to use only the ECB's daily rates. */
		FX_LIVE_URL: z
			.union([z.url(), z.literal("off")])
			.default("https://api.coinbase.com/v2/exchange-rates?currency=USD"),
		/** The fallback when live rates fail: Frankfurter's daily ECB reference rates. */
		FX_RATES_URL: z.url().default("https://api.frankfurter.dev/v1/latest"),
		/** `live` (default) or `sandbox`, to test the PayPal connection against PayPal's sandbox. */
		PAYPAL_ENV: z.enum(["live", "sandbox"]).default("live"),
		/** Set UPDATE_CHECK=false to skip polling GitHub. */
		UPDATE_CHECK: stringBoolean(true),
		/** How this copy was installed; the Docker image sets `docker`. */
		LEDGER_INSTALL: z.enum(["docker", "source"]).default("source"),
		/** API key for the OpenAI-compatible AI gateway; without it, POST /api/banks/chat answers 503. */
		AI_API_KEY: z.string().min(1).optional(),
		/** Base URL of the OpenAI-compatible gateway the finance chat talks to. */
		AI_BASE_URL: z.url().default("https://opencode.ai/inference/openai/v1"),
		/** Model id on that gateway for the finance chat. */
		AI_MODEL: z.string().min(1).default("deepseek-v4.1-flash"),
	},
	runtimeEnv: {
		...process.env,
		PUBLIC_URL:
			process.env.PUBLIC_URL?.trim() ||
			process.env.APP_URL?.trim() ||
			"http://localhost:5173",
		APP_SECRET: loadSecret(dataDir),
		DATA_DIR: dataDir,
	},
	emptyStringAsUndefined: true,
})
