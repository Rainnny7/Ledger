import { env } from "../config/env.ts"
/** Client-safe bank/scraper errors; raw Playwright output stays in server logs only. */

const CALL_LOG = /\n\s*call log:\n[\s\S]*/i
const PLAYWRIGHT_MARKERS =
	/(call log:|locator\.|page\.|timeout \d+ms exceeded|playwright)/i

function redactKnownSecrets(text: string, password?: string): string {
	let cleaned = text
	if (password && password.length > 0) {
		cleaned = cleaned.replaceAll(password, "[redacted]")
	}
	const secret = env.APP_SECRET
	if (secret && secret.length > 0) {
		cleaned = cleaned.replaceAll(secret, "[redacted]")
	}
	return cleaned
}

/** Strip Playwright call logs and fill() values before logging. */
export function redactBankErrorMessage(
	message: string,
	opts?: { password?: string }
): string {
	let cleaned = message.replace(CALL_LOG, "")
	cleaned = cleaned.replace(
		/fill\(\s*["'`][^"'`]*["'`]\s*\)/gi,
		'fill("[redacted]")'
	)
	cleaned = cleaned.replace(/fill\(\s*([^)]{3,}?)\s*\)/gi, (full, inner) =>
		/["'`]/.test(String(inner)) ? 'fill("[redacted]")' : full
	)
	return redactKnownSecrets(cleaned, opts?.password).trim()
}

function isScraperAuthMessage(message: string): boolean {
	if (PLAYWRIGHT_MARKERS.test(message)) {
		return false
	}
	return (
		message.length > 0 &&
		message.length <= 320 &&
		!message.includes("\n") &&
		!/at\s+\S+\s+\(/.test(message)
	)
}

/** BankErrorKind values accepted by validation and routes. */
export type BankErrorKind = "login" | "sync" | "connect"

const GENERIC: Record<BankErrorKind, string> = {
	login: "Could not complete login. Check your credentials and try again.",
	sync: "Could not read your accounts. Try connecting again.",
	connect:
		"Could not connect to your bank right now. Please try again in a few minutes.",
}

/** Turn Playwright/network errors into safe user-facing bank messages. */
export function bankErrorForClient(
	raw: unknown,
	kind: BankErrorKind,
	opts?: { site?: string; password?: string }
): string {
	const message =
		raw instanceof Error ? raw.message : raw != null ? String(raw) : ""
	const redacted = redactBankErrorMessage(message || "unknown error", opts)
	console.error(`[bank] ${kind}:`, redacted)
	if (isScraperAuthMessage(message)) {
		return message.slice(0, 320)
	}
	if (opts?.site && kind === "connect") {
		return `Could not connect to ${opts.site}. Please try again.`
	}
	return GENERIC[kind]
}
