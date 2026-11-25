/** Balance arithmetic for accounts: no React, so it can be unit-tested and used anywhere. */
import type { Account, Transaction } from "./api"

/** Credit and loan balances count as debt in net-worth math. */
export function isDebtAccount(account: Pick<Account, "type">) {
	return account.type === "credit" || account.type === "loan"
}

/** The overdraft a chequing/savings account comes with: its limit, or failing that available − balance. */
export function overdraftAllowance(
	account: Pick<Account, "type" | "balance" | "available" | "overdraftLimit">
) {
	if (isDebtAccount(account)) {
		return 0
	}
	if (account.overdraftLimit) {
		return account.overdraftLimit
	}
	if (account.available === null || account.balance === null) {
		return 0
	}
	return Math.max(
		0,
		Math.round((account.available - account.balance) * 100) / 100
	)
}

/** The balance to show for an account, with its overdraft added when that preference is on. */
export function shownBalance(account: Account, includeOverdraft: boolean) {
	if (account.balance === null) {
		return null
	}
	return includeOverdraft
		? account.balance + overdraftAllowance(account)
		: account.balance
}

/** Value that counts toward net worth: debts subtract. */
export function signedBalance(account: Account, includeOverdraft = false) {
	if (account.balance === null) {
		return 0
	}
	return isDebtAccount(account)
		? -Math.abs(account.balance)
		: (shownBalance(account, includeOverdraft) ?? 0)
}

/** A transaction's balance-after, on the same basis as the account's balance. */
export function shownRunningBalance(
	transaction: Pick<Transaction, "runningBalance">,
	account: Account | undefined,
	includeOverdraft: boolean
) {
	if (transaction.runningBalance === null) {
		return null
	}
	return includeOverdraft && account
		? transaction.runningBalance + overdraftAllowance(account)
		: transaction.runningBalance
}
