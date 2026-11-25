import { Money } from "@/components/common/money"
import {
	BalanceLabel,
	BalanceValue,
	CreditMeter,
	isDebtAccount,
	OverdraftMeter,
} from "@/components/accounts/account-figures"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import type { Account } from "@/lib/api"

/** React/UI entry: `AccountStatCards`. */
export function AccountStatCards({ account }: { account: Account }) {
	const debt = isDebtAccount(account)
	return (
		<div className="grid gap-4 sm:grid-cols-3">
			<Card size="sm">
				<CardHeader>
					<CardDescription>
						<BalanceLabel account={account} />
					</CardDescription>
					<CardTitle className="text-2xl! font-semibold">
						<BalanceValue account={account} />
					</CardTitle>
				</CardHeader>
			</Card>
			<Card size="sm">
				<CardHeader>
					<CardDescription>
						{account.type === "credit"
							? "Available credit"
							: "Available"}
					</CardDescription>
					<CardTitle className="text-2xl! font-semibold tabular-nums">
						<Money
							value={account.available}
							currency={account.currency}
						/>
					</CardTitle>
				</CardHeader>
			</Card>
			<Card size="sm">
				<CardHeader>
					<CardDescription>
						{debt ? "Credit limit" : "Overdraft"}
					</CardDescription>
					<CardTitle className="text-2xl! font-semibold tabular-nums">
						{debt ? (
							<Money
								value={
									account.creditLimit ??
									(account.available !== null &&
									account.balance !== null
										? account.available + account.balance
										: null)
								}
								currency={account.currency}
							/>
						) : (account.overdraftUsed ?? 0) > 0 ? (
							<span className="text-destructive">
								<Money
									value={account.overdraftUsed}
									currency={account.currency}
								/>
							</span>
						) : account.overdraftLimit ? (
							"Not in use"
						) : (
							"None"
						)}
					</CardTitle>
				</CardHeader>
				{(debt
					? account.type === "credit"
					: account.overdraftLimit ||
						(account.overdraftUsed ?? 0) > 0) && (
					<CardContent>
						{debt ? (
							<CreditMeter account={account} />
						) : (
							<OverdraftMeter account={account} />
						)}
					</CardContent>
				)}
			</Card>
		</div>
	)
}
