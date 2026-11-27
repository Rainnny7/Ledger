import type { BetterAuthPlugin } from "better-auth"
import { setSessionCookie } from "better-auth/cookies"
import { generateRandomString } from "better-auth/crypto"
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
	sensitiveSessionMiddleware,
} from "better-auth/api"
import { and, eq, like } from "drizzle-orm"
import * as z from "zod"
import { db } from "../db/connection.ts"
import { account, verification } from "../db/schema/index.ts"
import { userHasCredentialPassword } from "./credentials.ts"
import { deleteAccountMailContent } from "../mail/delete-account.ts"
import { isSmtpConfigured, sendMail } from "../mail/smtp.ts"
import { notifyUser } from "../notifications/service.ts"
import { passwordAddedMailContent } from "../mail/password-added.ts"

/** Lets passwordless accounts check status and set a credential password later. */
export function passwordPlugin(): BetterAuthPlugin {
	return {
		id: "ledger-password",
		endpoints: {
			passwordStatus: createAuthEndpoint(
				"/password/status",
				{
					method: "GET",
					use: [sessionMiddleware],
				},
				async (context) => {
					const userId = context.context.session.user.id
					return context.json({
						hasPassword: userHasCredentialPassword(userId),
					})
				}
			),
			passwordSet: createAuthEndpoint(
				"/password/set",
				{
					method: "POST",
					body: z.object({
						newPassword: z.string(),
						revokeOtherSessions: z.boolean().optional(),
					}),
					use: [sensitiveSessionMiddleware],
				},
				async (context) => {
					const { newPassword, revokeOtherSessions } = context.body
					const revokeOthers = revokeOtherSessions ?? true
					const session = context.context.session
					const passwordHash =
						await context.context.password.hash(newPassword)
					const accountId =
						context.context.generateId({ model: "account" }) ||
						crypto.randomUUID()
					// Check and write in one synchronous transaction: nothing can run between them, so two
					// simultaneous requests can't both pass the check and leave two credential accounts.
					const stored = db.transaction((transaction) => {
						const existing = transaction
							.select({
								id: account.id,
								password: account.password,
							})
							.from(account)
							.where(
								and(
									eq(account.userId, session.user.id),
									eq(account.providerId, "credential")
								)
							)
							.get()
						if (existing?.password) {
							return false
						}
						const now = new Date().toISOString()
						if (existing) {
							transaction
								.update(account)
								.set({ password: passwordHash, updatedAt: now })
								.where(eq(account.id, existing.id))
								.run()
						} else {
							transaction
								.insert(account)
								.values({
									id: accountId,
									userId: session.user.id,
									providerId: "credential",
									accountId: session.user.id,
									password: passwordHash,
									createdAt: now,
									updatedAt: now,
								})
								.run()
						}
						// An emailed delete link was meant for an account without a password; it must not outlive this.
						transaction
							.delete(verification)
							.where(
								and(
									eq(verification.value, session.user.id),
									like(
										verification.identifier,
										"delete-account-%"
									)
								)
							)
							.run()
						return true
					})
					if (!stored) {
						throw new APIError("BAD_REQUEST", {
							message: "Password is already set.",
							code: "PASSWORD_ALREADY_SET",
						})
					}
					let token: string | null = null
					if (revokeOthers) {
						await context.context.internalAdapter.deleteUserSessions(
							session.user.id
						)
						const newSession =
							await context.context.internalAdapter.createSession(
								session.user.id
							)
						if (!newSession) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Could not refresh your session.",
							})
						}
						await setSessionCookie(context, {
							session: newSession,
							user: session.user,
						})
						token = newSession.token
					}
					const subject = "A password was added to your Ledger account"
					const { text, html } = passwordAddedMailContent()
					try {
						await notifyUser({
							userId: session.user.id,
							source: "security",
							kind: "warning",
							title: subject,
							body: text,
							mail: { subject, text, html },
						})
					} catch (error) {
						console.error(
							"[notify] password-added notice failed",
							error
						)
					}
					return context.json({ status: true, token })
				}
			),
			deleteUserRequestLink: createAuthEndpoint(
				"/delete-user/request-link",
				{
					method: "POST",
					body: z.object({
						callbackURL: z.string().optional(),
					}),
					use: [sensitiveSessionMiddleware],
				},
				async (context) => {
					const session = context.context.session
					if (userHasCredentialPassword(session.user.id)) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Enter your password to delete your account.",
							code: "PASSWORD_REQUIRED",
						})
					}
					if (!isSmtpConfigured()) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Email is not configured on this server. Ask an admin to enable SMTP before deleting your account.",
						})
					}
					const token = generateRandomString(32, "0-9", "a-z")
					await context.context.internalAdapter.createVerificationValue(
						{
							value: session.user.id,
							identifier: `delete-account-${token}`,
							expiresAt: new Date(Date.now() + 86_400_000),
						}
					)
					const callbackURL = encodeURIComponent(
						context.body.callbackURL ?? "/login"
					)
					const url = `${context.context.baseURL}/delete-user/callback?token=${token}&callbackURL=${callbackURL}`
					const { text, html } = deleteAccountMailContent(url)
					await sendMail({
						to: session.user.email,
						subject: "Confirm deleting your Ledger account",
						text,
						html,
					})
					return context.json({
						success: true,
						message: "Verification email sent",
					})
				}
			),
		},
	}
}
