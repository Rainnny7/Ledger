import {
	type AuthProblem,
	friendlyAuthProblem,
} from "@/components/auth/auth-problem"
import { isStrongPassword } from "@/components/common/password-rules"
import { CaptchaUnavailableError } from "@/components/auth/use-captcha"
import { LookupError } from "@/lib/auth-lookup"

/**
 * Where the visitor is: typing their email, entering their password, creating an account, told
 * that sign-ups are closed, or entering a two-factor code.
 */
export type AuthStep =
	| "email"
	| "password"
	| "register"
	| "closed"
	| "code"
	| "sent"
	| "verify"

/** What to say at the top of the card for each step. */
const AUTH_STEP_COPY: Record<AuthStep, { title: string; description: string }> =
	{
		email: {
			title: "Log In or Sign Up",
			description: "Enter your email to continue.",
		},
		password: {
			title: "Welcome Back",
			description:
				"Enter your password to see your balances and transactions.",
		},
		register: {
			title: "Create Your Account",
			description:
				"Choose a password to start tracking your bank accounts.",
		},
		closed: {
			title: "Sign-Ups Are Closed",
			description: "This server isn’t taking new accounts right now.",
		},
		code: {
			title: "Two-Factor Authentication",
			description: "Enter the 6-digit code from your authenticator app.",
		},
		sent: {
			title: "Check Your Email",
			description: "",
		},
		verify: {
			title: "Verify Your Email",
			description: "",
		},
	}

export const AUTH_SUBMIT_LABEL: Record<AuthStep, string> = {
	email: "Continue",
	password: "Log in",
	register: "Create Account",
	closed: "Use a different email",
	code: "Verify",
	sent: "Use a different email",
	verify: "Back to log in",
}

/** A problem to show, and the field it belongs to (flagged invalid for assistive tech). */
export type AuthFormProblem = AuthProblem & {
	field?: "email" | "password" | "confirm"
}

/** What a failed login or verification link (the `?error=` on this page) means, in plain words. */
export function problemFromLinkError(errorCode: string): AuthProblem {
	switch (errorCode) {
		case "banned":
			return {
				title: "Access Turned Off",
				message:
					"Your access to this Ledger has been turned off. Ask its admin to restore it.",
			}
		case "REGISTRATION_CLOSED":
		case "new_user_signup_disabled":
			return {
				title: "Sign-Ups Are Closed",
				message:
					"This server isn’t accepting new accounts right now. Ask its admin to add you.",
			}
		case "user_not_found":
		case "USER_NOT_FOUND":
			return {
				title: "No Account Found",
				message:
					"We couldn’t find an account for that link. Enter your email to log in or sign up.",
			}
		default:
			return {
				title: "Link Expired or Invalid",
				message:
					"That link may have expired or already been used. Request a new one or log in with your password.",
			}
	}
}

/** Turns anything thrown while checking the captcha, looking up the email or calling the API into a message. */
export function problemFromThrown(error: unknown): AuthFormProblem {
	if (error instanceof CaptchaUnavailableError) {
		return {
			title: "Security Check Unavailable",
			message:
				"We couldn’t run the security check. Check your connection or any content blockers, then try again.",
		}
	}
	if (error instanceof LookupError) {
		return {
			...friendlyAuthProblem(error, "Couldn’t check that email"),
			field: error.status === 400 ? "email" : undefined,
		}
	}
	return {
		title: "Can’t Reach the Server",
		message: "Check your connection and try again.",
	}
}

/** Card title and description for the current auth step. */
export function authPageStepCopy(
	step: AuthStep,
	options: {
		useBackup: boolean
		emailFirstSignUp: boolean
		email: string
	}
) {
	if (step === "code" && options.useBackup) {
		return {
			...AUTH_STEP_COPY.code,
			description:
				"Enter one of the backup codes you saved when you turned on 2FA.",
		}
	}
	if (step === "register" && options.emailFirstSignUp) {
		return {
			...AUTH_STEP_COPY.register,
			description:
				"Enter your name and we’ll email you a sign-in link to create your account.",
		}
	}
	if (step === "verify") {
		return {
			...AUTH_STEP_COPY.verify,
			description: `We sent a verification link to ${options.email.trim()}. Open it, then log in.`,
		}
	}
	if (step === "sent") {
		return {
			...AUTH_STEP_COPY.sent,
			description: `We sent a login link to ${options.email.trim()}. It expires in 10 minutes.`,
		}
	}
	return AUTH_STEP_COPY[step]
}

/** Whether the primary submit button should be disabled. */
export function authSubmitDisabled(options: {
	pending: boolean
	step: AuthStep
	email: string
	password: string
	name: string
	confirmPassword: string
	code: string
	configReady: boolean
	isRegister: boolean
	emailFirstSignUp: boolean
	passwordRegister: boolean
}) {
	return (
		options.pending ||
		(options.step === "email" &&
			(!options.email.trim() || !options.configReady)) ||
		(options.step === "password" && !options.password) ||
		(options.passwordRegister &&
			(!options.name.trim() ||
				!isStrongPassword(options.password) ||
				options.password !== options.confirmPassword)) ||
		(options.isRegister &&
			options.emailFirstSignUp &&
			!options.name.trim()) ||
		(options.step === "code" && !options.code.trim())
	)
}
