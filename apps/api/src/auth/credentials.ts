import { and, eq, isNotNull } from "drizzle-orm"
import { endUserSessions } from "../banks/sessions.ts"
import { db } from "../db/connection.ts"
import { account, session } from "../db/schema/index.ts"

/** Whether this user has a Better Auth credential account with a stored password hash. */
export function userHasCredentialPassword(userId: string): boolean {
	return !!db
		.select({ id: account.id })
		.from(account)
		.where(
			and(
				eq(account.userId, userId),
				eq(account.providerId, "credential"),
				isNotNull(account.password)
			)
		)
		.get()
}

/**
 * Removes a credential password and every app session when the mailbox owner proves the address.
 * A password chosen before verification must not survive that proof.
 */
export async function discardPasswordSetBeforeEmailProof(
	userId: string
): Promise<void> {
	if (!userHasCredentialPassword(userId)) {
		return
	}
	db.delete(account)
		.where(
			and(eq(account.userId, userId), eq(account.providerId, "credential"))
		)
		.run()
	db.delete(session).where(eq(session.userId, userId)).run()
	await endUserSessions(userId)
}
