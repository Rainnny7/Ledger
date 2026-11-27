import { isAPIError } from "better-auth/api"
import { audit } from "../admin/store.ts"
import { clientIp, redirectErrorCode } from "./hooks.ts"

/** Users created by a login link whose request is still being handled, so the audit says "Signed up". */
const magicLinkSignUps = new Set<string>()

/** Remembers that this request's login link created the account (called from the user-create hook). */
export function markMagicLinkSignUp(userId: string) {
	magicLinkSignUps.add(userId)
}

/** The pieces of the auth hook context the login-link auditing reads. */
export type MagicLinkHookContext = {
	path: string
	headers?: Headers
	request?: Request
	redirect: (url: string) => unknown
	context: {
		newSession?: {
			user: { id: string; email: string; twoFactorEnabled?: boolean }
		} | null
	}
}

/** What the audit trail says about each way a login link can fail. */
const FAILURE_DETAIL: Record<string, string> = {
	REGISTRATION_CLOSED: "registration is closed",
	new_user_signup_disabled: "registration is closed",
	user_not_found: "no account for this link",
	INVALID_TOKEN: "invalid or expired login link",
}

function auditMagicLinkSuccess(
	context: MagicLinkHookContext,
	userId: string,
	email: string
) {
	const isSignUp = magicLinkSignUps.delete(userId)
	audit({
		kind: "auth",
		ip: clientIp(context),
		actorId: userId,
		actorEmail: email,
		action: isSignUp ? "Signed up" : "Logged in",
		detail: "with an email link",
	})
}

/**
 * Audits magic-link verify outcomes. Must run from the auth after hook instead of logAuthEvent so
 * redirects and 2FA hand-offs are not skipped or doubled.
 */
export function auditMagicLinkVerify(
	context: MagicLinkHookContext,
	returned: unknown
) {
	try {
		const ip = clientIp(context)
		const errorCode = redirectErrorCode(returned)
		if (errorCode) {
			audit({
				kind: "auth",
				failed: true,
				ip,
				actorId: null,
				actorEmail: null,
				action: "Logged in",
				detail:
					FAILURE_DETAIL[errorCode] ??
					`login link failed (${errorCode})`,
			})
			return
		}
		const created = context.context.newSession
		if (created && !created.user.twoFactorEnabled) {
			auditMagicLinkSuccess(context, created.user.id, created.user.email)
		}
	} catch (error) {
		console.error("[audit] magic-link verify", error)
	}
}

/** Answers a banned user's magic-link verification with a redirect to the login page and records a failed audit; returns the redirect, or undefined when the user is not banned. */
export function redirectBannedMagicLinkVerify(
	context: MagicLinkHookContext,
	returned: unknown
) {
	if (!isAPIError(returned)) {
		return undefined
	}
	const code =
		(returned as { body?: { code?: string }; code?: string }).body?.code ??
		(returned as { code?: string }).code
	if (code !== "BANNED_USER") {
		return undefined
	}
	audit({
		kind: "auth",
		failed: true,
		ip: clientIp(context),
		actorId: null,
		actorEmail: null,
		action: "Logged in",
		detail: "access turned off",
	})
	// A real 302: the endpoint failed with a 403, which a redirect error alone would not override.
	return new Response(null, {
		status: 302,
		headers: { location: "/login?error=banned" },
	})
}
