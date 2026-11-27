import { CircleAlert } from "lucide-react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"

/** A problem to show on the auth form: a short title and one friendly sentence of what to do. */
export type AuthProblem = { title: string; message: string }

/** The pieces of a Better Auth (or lookup) failure used to pick a friendly message. */
export type AuthFailure = {
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

/** Error panel for the auth form: icon, title and message, announced to screen readers and animated in and out. */
export function AuthError({ problem }: { problem: AuthProblem | null }) {
	return (
		<LazyMotion features={domAnimation}>
			<AnimatePresence initial={false}>
				{problem && (
					<m.div
						key="problem"
						role="alert"
						className="overflow-hidden"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
					>
						<div className="pb-4">
							<div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
								<CircleAlert
									aria-hidden
									className="mt-0.5 size-4 shrink-0"
								/>
								<div className="grid gap-0.5">
									<p className="font-medium">
										{problem.title}
									</p>
									<p className="text-destructive/90">
										{problem.message}
									</p>
								</div>
							</div>
						</div>
					</m.div>
				)}
			</AnimatePresence>
		</LazyMotion>
	)
}
