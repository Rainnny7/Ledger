import { useMemo } from "react"
import { accountLimitShowsMeter } from "@/components/accounts/account-limit-value"
import { AccountDetailsButton } from "@/components/accounts/account-details-dialog"
import {
	BalanceLabel,
	BalanceValue,
	CreditMeter,
	isDebtAccount,
	OverdraftMeter,
	useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { InstitutionBadge } from "@/components/accounts/institution"
import { BalanceChart } from "@/components/common/charts"
import { Money } from "@/components/common/money"
import { RangePicker } from "@/components/common/range-picker"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { Account, Connection, Transaction } from "@/lib/api"
import { balanceSeries } from "@/lib/finance"
import { ACCOUNT_TYPE_LABEL, formatRelative } from "@/lib/format"
import { rangeStart, useRangeState } from "@/lib/ranges"

/**
 * Compact header of the Accounts page's right pane for one account: who it belongs to, its meta
 * line, balance / available / limit figures, and a small balance chart with its own range picker.
 */
export function AccountHeaderCard({
	account,
	connection,
	transactions,
}: {
	account: Account
	connection: Connection | undefined
	/** Only this account's transactions, used to rebuild the balance history. */
	transactions: Transaction[]
}) {
	const [chartRange, setChartRange] = useRangeState("chart", "90d")
	const includeOverdraft = useIncludeOverdraft()
	const debt = isDebtAccount(account)
	const series = useMemo(
		() =>
			balanceSeries(
				[account],
				transactions,
				rangeStart(chartRange),
				includeOverdraft
			),
		[account, transactions, chartRange, includeOverdraft]
	)

	return (
		<Card>
			{/* min-h fits the tallest variant (meter wrapped onto its own row) so switching accounts doesn't resize the card. */}
			<CardContent className="grid items-center gap-5 lg:min-h-40 lg:grid-cols-[1fr_1.2fr]">
				<div className="grid gap-2">
					<div className="flex min-w-0 items-center gap-2">
						{connection ? (
							<InstitutionBadge
								institution={connection.institution}
								className="size-7 text-xs"
							/>
						) : null}
						<h2 className="truncate font-medium">{account.name}</h2>
						<Badge variant="secondary">
							{ACCOUNT_TYPE_LABEL[account.type]}
						</Badge>
					</div>
					<div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
						<span>
							{account.numberMasked
								? `${account.numberMasked} · `
								: ""}
							{account.currency} · updated{" "}
							{formatRelative(account.updatedAt)}
						</span>
						{account.type !== "wallet" && (
							<AccountDetailsButton
								account={account}
								size="xs"
								variant="ghost"
							/>
						)}
					</div>
					<div className="mt-1 flex flex-wrap gap-x-6 gap-y-3">
						<div className="grid">
							<span className="text-xs text-muted-foreground">
								<BalanceLabel account={account} />
							</span>
							<BalanceValue
								account={account}
								className="text-xl font-semibold"
							/>
						</div>
						{account.available !== null && (
							<div className="grid">
								<span className="text-xs text-muted-foreground">
									{account.type === "credit"
										? "Available credit"
										: "Available"}
								</span>
								<span className="text-xl font-semibold tabular-nums">
									<Money
										value={account.available}
										currency={account.currency}
									/>
								</span>
							</div>
						)}
						{accountLimitShowsMeter(account, debt) && (
							<div className="min-w-44 flex-1 self-end">
								{debt ? (
									<CreditMeter account={account} />
								) : (
									<OverdraftMeter account={account} />
								)}
							</div>
						)}
					</div>
				</div>
				<div className="grid min-w-0 gap-2">
					<div className="flex items-center justify-between gap-2">
						<span className="text-xs text-muted-foreground">
							{debt ? "Balance owing" : "Balance"}
						</span>
						<RangePicker
							value={chartRange}
							onChange={setChartRange}
						/>
					</div>
					<BalanceChart
						data={series}
						currency={account.currency}
						from={rangeStart(chartRange)}
						className="h-28"
					/>
				</div>
			</CardContent>
		</Card>
	)
}
