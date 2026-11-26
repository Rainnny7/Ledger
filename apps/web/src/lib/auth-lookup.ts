import { captchaHeaders } from "@/components/auth/use-captcha"

/** What the server knows about an email address, before anyone has logged in. */
export type EmailLookup = { exists: boolean; registrationOpen: boolean }

/** A failed lookup, carrying the HTTP status and server code for friendly error mapping. */
export class LookupError extends Error {
	status: number
	code?: string
	constructor(status: number, message: string, code?: string) {
		super(message)
		this.name = "LookupError"
		this.status = status
		this.code = code
	}
}

/**
 * Asks the server whether an account exists for this email and whether sign-ups are open, so the
 * single login page can show the right fields.
 *
 * @param email The address typed on the login page.
 * @param captchaToken A fresh Turnstile token, or null when captcha is off.
 */
export async function lookupEmail(
	email: string,
	captchaToken: string | null
): Promise<EmailLookup> {
	const response = await fetch("/api/auth/lookup", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...captchaHeaders(captchaToken),
		},
		body: JSON.stringify({ email }),
	})
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: string
			code?: string
		} | null
		throw new LookupError(response.status, body?.error ?? "", body?.code)
	}
	return (await response.json()) as EmailLookup
}
