import { createTransport } from "nodemailer"
import { getSetting, setSetting } from "../db/connection.ts"
import { decrypt, encrypt } from "../security/crypto.ts"

const SMTP_CONFIG_KEY = "smtp_config"

/** Persisted SMTP settings (password is encrypted at rest). */
interface StoredSmtpConfig {
	host: string
	port: number
	secure: boolean
	username: string
	passwordCipher: string
	fromAddress: string
	fromName: string
	/** Optional DKIM signing by Ledger, for relays that don't sign mail themselves. */
	dkimDomainName?: string
	dkimKeySelector?: string
	dkimPrivateKeyCipher?: string
}

/** SMTP settings safe to return from the API (no secret material). */
export interface PublicSmtpConfig {
	host: string
	port: number
	secure: boolean
	username: string
	fromAddress: string
	fromName: string
	passwordSet: boolean
	configured: boolean
	dkimDomainName: string
	dkimKeySelector: string
	dkimPrivateKeySet: boolean
}

/** Body accepted when saving SMTP settings (password optional to keep the stored one). */
export interface SmtpConfigInput {
	host: string
	port: number
	secure: boolean
	username: string
	password?: string
	fromAddress: string
	fromName: string
	/** Leave the domain blank to turn DKIM signing off. */
	dkimDomainName?: string
	dkimKeySelector?: string
	/** PEM private key; blank or omitted keeps the stored one. */
	dkimPrivateKey?: string
}

function loadStored(): StoredSmtpConfig | null {
	const raw = getSetting(SMTP_CONFIG_KEY)
	if (!raw) {
		return null
	}
	try {
		return JSON.parse(raw) as StoredSmtpConfig
	} catch {
		return null
	}
}

function toPublic(stored: StoredSmtpConfig | null): PublicSmtpConfig {
	const passwordSet = Boolean(stored?.passwordCipher?.trim())
	const host = stored?.host?.trim() ?? ""
	const fromAddress = stored?.fromAddress?.trim() ?? ""
	return {
		host,
		port: stored?.port ?? 587,
		secure: stored?.secure ?? false,
		username: stored?.username?.trim() ?? "",
		fromAddress,
		fromName: stored?.fromName?.trim() ?? "",
		passwordSet,
		configured: Boolean(host && fromAddress && passwordSet),
		dkimDomainName: stored?.dkimDomainName?.trim() ?? "",
		dkimKeySelector: stored?.dkimKeySelector?.trim() ?? "",
		dkimPrivateKeySet: Boolean(stored?.dkimPrivateKeyCipher?.trim()),
	}
}

/** Returns SMTP settings for admins; never includes the password (only `passwordSet`). */
export function getSmtpConfig(): PublicSmtpConfig {
	return toPublic(loadStored())
}

/**
 * Saves SMTP settings. A blank or omitted password leaves the previously stored password in place.
 */
export function saveSmtpConfig(input: SmtpConfigInput): PublicSmtpConfig {
	const existing = loadStored()
	const passwordPlain = input.password?.trim()
	let passwordCipher = existing?.passwordCipher ?? ""
	if (passwordPlain) {
		passwordCipher = encrypt(passwordPlain)
	}
	const dkimDomainName = input.dkimDomainName?.trim() ?? ""
	const dkimPrivateKey = input.dkimPrivateKey?.trim()
	let dkimPrivateKeyCipher = existing?.dkimPrivateKeyCipher ?? ""
	if (!dkimDomainName) {
		dkimPrivateKeyCipher = ""
	} else if (dkimPrivateKey) {
		dkimPrivateKeyCipher = encrypt(dkimPrivateKey)
	}
	const stored: StoredSmtpConfig = {
		host: input.host.trim(),
		port: input.port,
		secure: input.secure,
		username: input.username.trim(),
		passwordCipher,
		fromAddress: input.fromAddress.trim(),
		fromName: input.fromName.trim(),
		dkimDomainName,
		dkimKeySelector: dkimDomainName
			? (input.dkimKeySelector?.trim() ?? "")
			: "",
		dkimPrivateKeyCipher,
	}
	setSetting(SMTP_CONFIG_KEY, JSON.stringify(stored))
	return toPublic(stored)
}

/** True when host, from address, and a password are all configured. */
export function isSmtpConfigured(): boolean {
	return getSmtpConfig().configured
}

function transportFromStored(stored: StoredSmtpConfig) {
	const password = decrypt<string>(stored.passwordCipher)
	const dkim =
		stored.dkimDomainName &&
		stored.dkimKeySelector &&
		stored.dkimPrivateKeyCipher
			? {
					domainName: stored.dkimDomainName,
					keySelector: stored.dkimKeySelector,
					privateKey: decrypt<string>(stored.dkimPrivateKeyCipher),
				}
			: undefined
	return createTransport({
		dkim,
		host: stored.host,
		port: stored.port,
		secure: stored.secure,
		auth:
			stored.username.trim().length > 0
				? { user: stored.username, pass: password }
				: undefined,
	})
}

/** Sends one message through the configured SMTP relay; throws a clear error on failure. */
export async function sendMail(options: {
	to: string
	subject: string
	text: string
	html?: string
	/** Extra message headers, such as List-Unsubscribe. */
	headers?: Record<string, string>
}): Promise<void> {
	const stored = loadStored()
	if (!stored || !isSmtpConfigured()) {
		throw new Error("SMTP is not configured.")
	}
	const transport = transportFromStored(stored)
	const from =
		stored.fromName.trim().length > 0
			? `"${stored.fromName.replaceAll('"', "")}" <${stored.fromAddress}>`
			: stored.fromAddress
	try {
		await transport.sendMail({
			from,
			to: options.to,
			subject: options.subject,
			text: options.text,
			html: options.html,
			headers: options.headers,
		})
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "SMTP delivery failed."
		throw new Error(message, { cause: error })
	}
}

/** Sends a short test message to confirm SMTP settings. */
export async function sendTestMail(to: string): Promise<void> {
	await sendMail({
		to,
		subject: "Ledger SMTP test",
		text: "This is a test message from your Ledger instance.",
	})
}
