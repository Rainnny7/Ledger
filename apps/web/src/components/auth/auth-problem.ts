/** A problem to show on the auth form: a short title and one friendly sentence of what to do. */
export type AuthProblem = { title: string; message: string }

/** The pieces of a Better Auth (or lookup) failure used to pick a friendly message. */
type AuthFailure = {
	status?: number
	code?: string
	message?: string
}

/**
 * Turns an API failure into a message a person can act on, instead of whatever the server or
 * Better Auth happened to say.
 *
 * @param failure The error from the auth client or the lookup request.
 * @param fallbackTitle Title when nothing more specific is known.
 */
export function friendlyAuthProblem(
	failure: AuthFailure,
	fallbackTitle = "Something went wrong"
): AuthProblem {
	const { status, code, message } = failure
	if (status === 429) {
		return {
			title: "Too many attempts",
			message: "Please wait a minute or two, then try again.",
		}
	}
	if (
		code === "VERIFICATION_FAILED" ||
		code === "MISSING_RESPONSE" ||
		code === "CAPTCHA_FAILED"
	) {
		return {
			title: "Security check failed",
			message:
				"We couldn’t confirm you’re human. Reload the page and try again.",
		}
	}
	if (code === "INVALID_EMAIL_OR_PASSWORD") {
		return {
			title: "That didn’t work",
			message:
				"The email or password is incorrect. Check them and try again.",
		}
	}
	if (code === "BANNED_USER") {
		return {
			title: "Access turned off",
			message:
				message ??
				"Your access to this Ledger has been turned off. Ask its admin to restore it.",
		}
	}
	if (code === "EMAIL_NOT_VERIFIED") {
		return {
			title: "Verify your email first",
			message:
				"Open the verification link we emailed you. Logging in with your password sends a new one.",
		}
	}
	if (code === "INVALID_TWO_FACTOR_COOKIE") {
		return {
			title: "Login link session expired",
			message:
				"Your login link session expired. Request a new link and try again.",
		}
	}
	if (code === "WEAK_PASSWORD") {
		return {
			title: "Choose a stronger password",
			message: message ?? "That password doesn’t meet the requirements.",
		}
	}
	if (code?.startsWith("USER_ALREADY")) {
		return {
			title: "Account already exists",
			message: "Go back and log in with that email instead.",
		}
	}
	if (status === 403 && message === "Registration is closed.") {
		return {
			title: "Sign-ups are closed",
			message: "This server isn’t accepting new accounts right now.",
		}
	}
	return {
		title: fallbackTitle,
		message: message || "Please try again in a moment.",
	}
}
