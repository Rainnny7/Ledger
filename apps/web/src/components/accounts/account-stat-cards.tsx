import { Money } from "@/components/common/money"
import { AccountLimitStatCard } from "@/components/accounts/account-limit-stat-card"
import {
	BalanceLabel,
	BalanceValue,
} from "@/components/accounts/account-figures"
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import type { Account } from "@/lib/api"

/** React/UI entry: `AccountStatCards`. */
export function AccountStatCards({ account }: { account: Account }) {
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
			<AccountLimitStatCard account={account} />
		</div>
	)
}
