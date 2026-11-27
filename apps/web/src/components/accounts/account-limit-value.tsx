import { Money } from "@/components/common/money"
import type { Account } from "@/lib/api"
import type { ReactNode } from "react"

/** Title and value for the limit/overdraft stat card header. */
export function accountLimitStatCopy(
	account: Account,
	debt: boolean
): {
	title: string
	value: ReactNode
} {
	if (debt) {
		return {
			title: "Credit limit",
			value: (
				<Money
					value={
						account.creditLimit ??
						(account.available !== null && account.balance !== null
							? account.available + account.balance
							: null)
					}
					currency={account.currency}
				/>
			),
		}
	}
	if ((account.overdraftUsed ?? 0) > 0) {
		return {
			title: "Overdraft",
			value: (
				<span className="text-destructive">
					<Money
						value={account.overdraftUsed}
						currency={account.currency}
					/>
				</span>
			),
		}
	}
	if (account.overdraftLimit) {
		return { title: "Overdraft", value: "Not in use" }
	}
	return { title: "Overdraft", value: "None" }
}

/** Whether to show the credit or overdraft meter under the limit card. */
export function accountLimitShowsMeter(
	account: Account,
	debt: boolean
): boolean {
	if (debt) {
		return account.type === "credit"
	}
	return Boolean(account.overdraftLimit || (account.overdraftUsed ?? 0) > 0)
}
