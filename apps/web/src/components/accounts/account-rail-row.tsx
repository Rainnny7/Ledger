import { Link } from "@tanstack/react-router"
import { accountUsagePercent } from "@/components/accounts/account-limit-value"
import { BalanceValue } from "@/components/accounts/account-figures"
import { Money } from "@/components/common/money"
import { Progress } from "@/components/ui/progress"
import type { Account } from "@/lib/api"
import { ACCOUNT_TYPE_LABEL } from "@/lib/format"
import { cn } from "cn"

/** Shared look of the rail's selectable rows ("All accounts" and each account). */
export const RAIL_ROW_CLASS =
	"grid gap-1.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted/60 aria-[current=page]:bg-primary/10"

/** "All accounts" row at the top of the rail: links to the merged list with the net total. */
export function AllAccountsRailRow({
	accountCount,
	netTotal,
	currency,
	selected,
}: {
	accountCount: number
	netTotal: number
	currency: string
	selected: boolean
}) {
	return (
		<Link
			to="/accounts"
			activeOptions={{ exact: true }}
			aria-current={selected ? "page" : undefined}
			className={RAIL_ROW_CLASS}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate font-medium">All accounts</div>
					<div className="text-xs text-muted-foreground">
						{accountCount}{" "}
						{accountCount === 1 ? "account" : "accounts"} · net
					</div>
				</div>
				<Money
					value={netTotal}
					currency={currency}
					className="font-semibold tabular-nums"
				/>
			</div>
		</Link>
	)
}

/** One account in the rail: name, type or masked number, balance and a tiny usage meter. */
export function AccountRailRow({
	account,
	selected,
}: {
	account: Account
	selected: boolean
}) {
	const usage = accountUsagePercent(account)
	return (
		<Link
			to="/accounts/$id"
			params={{ id: account.id }}
			aria-current={selected ? "page" : undefined}
			className={RAIL_ROW_CLASS}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate font-medium">{account.name}</div>
					<div className="truncate text-xs text-muted-foreground">
						{account.numberMasked ??
							ACCOUNT_TYPE_LABEL[account.type]}
					</div>
				</div>
				<BalanceValue
					account={account}
					className="shrink-0 font-medium"
				/>
			</div>
			{usage !== null ? (
				<Progress
					aria-label="Credit or overdraft used"
					value={usage}
					className={cn(
						"[&_[data-slot=progress-track]]:h-1",
						account.type !== "credit" &&
							"[&_[data-slot=progress-indicator]]:bg-destructive"
					)}
				/>
			) : null}
		</Link>
	)
}
