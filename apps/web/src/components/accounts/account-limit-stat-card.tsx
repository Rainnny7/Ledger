import {
	accountLimitShowsMeter,
	accountLimitStatCopy,
} from "@/components/accounts/account-limit-value"
import {
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

/** Third stat card: credit limit for debt accounts, or overdraft usage for chequing. */
export function AccountLimitStatCard({ account }: { account: Account }) {
	const debt = isDebtAccount(account)
	const { title, value } = accountLimitStatCopy(account, debt)
	const showMeter = accountLimitShowsMeter(account, debt)

	return (
		<Card size="sm">
			<CardHeader>
				<CardDescription>{title}</CardDescription>
				<CardTitle className="text-2xl! font-semibold tabular-nums">
					{value}
				</CardTitle>
			</CardHeader>
			{showMeter ? (
				<CardContent>
					{debt ? (
						<CreditMeter account={account} />
					) : (
						<OverdraftMeter account={account} />
					)}
				</CardContent>
			) : null}
		</Card>
	)
}
