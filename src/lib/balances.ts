/** Balance arithmetic for accounts: no React, so it can be unit-tested and used anywhere. */
import type { Account, Transaction } from "./api"

export function isDebtAccount(a: Pick<Account, "type">) {
  return a.type === "credit" || a.type === "loan"
}

/** The overdraft a chequing/savings account comes with: its limit, or failing that available − balance. */
export function overdraftAllowance(
  a: Pick<Account, "type" | "balance" | "available" | "overdraftLimit">
) {
  if (isDebtAccount(a)) return 0
  if (a.overdraftLimit) return a.overdraftLimit
  if (a.available === null || a.balance === null) return 0
  return Math.max(0, Math.round((a.available - a.balance) * 100) / 100)
}

/** The balance to show for an account, with its overdraft added when that preference is on. */
export function shownBalance(a: Account, includeOverdraft: boolean) {
  if (a.balance === null) return null
  return includeOverdraft ? a.balance + overdraftAllowance(a) : a.balance
}

/** Value that counts toward net worth: debts subtract. */
export function signedBalance(a: Account, includeOverdraft = false) {
  if (a.balance === null) return 0
  return isDebtAccount(a)
    ? -Math.abs(a.balance)
    : (shownBalance(a, includeOverdraft) ?? 0)
}

/** A transaction's balance-after, on the same basis as the account's balance. */
export function shownRunningBalance(
  t: Pick<Transaction, "runningBalance">,
  account: Account | undefined,
  includeOverdraft: boolean
) {
  if (t.runningBalance === null) return null
  return includeOverdraft && account
    ? t.runningBalance + overdraftAllowance(account)
    : t.runningBalance
}
