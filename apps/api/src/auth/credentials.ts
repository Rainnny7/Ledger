import { and, eq, isNotNull } from "drizzle-orm"
import { db } from "../db/connection.ts"
import { account } from "../db/schema/index.ts"

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
