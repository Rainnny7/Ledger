import type { Account } from "@/lib/api"

/** Whether to show the credit or overdraft meter for an account. */
export function accountLimitShowsMeter(
	account: Account,
	debt: boolean
): boolean {
	if (debt) {
		return account.type === "credit"
	}
	return Boolean(account.overdraftLimit || (account.overdraftUsed ?? 0) > 0)
}

/**
 * How much of its credit limit (credit cards) or overdraft (chequing, savings) an account is using,
 * as 0 to 100, or null when the meter isn't relevant (no limit, or an overdraft not in use).
 */
export function accountUsagePercent(account: Account): number | null {
	if (account.type === "credit") {
		const limit =
			account.creditLimit ??
			(account.available !== null && account.balance !== null
				? account.available + account.balance
				: null)
		if (!limit) {
			return null
		}
		return Math.min(100, (Math.max(0, account.balance ?? 0) / limit) * 100)
	}
	const used = account.overdraftUsed ?? 0
	if (used <= 0) {
		return null
	}
	return account.overdraftLimit
		? Math.min(100, (used / account.overdraftLimit) * 100)
		: 100
}
