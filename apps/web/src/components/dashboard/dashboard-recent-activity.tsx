import { Money } from "@/components/common/money"
import {
	TransactionMenuItems,
	WithContextMenu,
} from "@/components/layout/app-context-menu"
import { CategoryIcon, RelativeDate } from "@/components/transactions/tx-bits"
import type { Account, Transaction } from "@/lib/api"
import { cn } from "cn"

/** Latest transactions list on the dashboard home page. */
export function DashboardRecentActivity({
	transactions,
	accounts,
	txReady,
	onSelectTransaction,
}: {
	transactions: Transaction[]
	accounts: Account[]
	txReady: boolean
	onSelectTransaction: (transaction: Transaction) => void
}) {
	if (txReady && transactions.length === 0) {
		return (
			<p className="py-6 text-center text-sm text-muted-foreground">
				No transactions yet.
			</p>
		)
	}
	return (
		<>
			{transactions.slice(0, 6).map((transaction) => {
				const account = accounts.find(
					(candidate) => candidate.id === transaction.accountId
				)
				return (
					<WithContextMenu
						key={transaction.id}
						menu={
							<TransactionMenuItems
								transaction={transaction}
								currency={account?.currency}
								onOpen={() => onSelectTransaction(transaction)}
							/>
						}
					>
						<button
							type="button"
							onClick={() => onSelectTransaction(transaction)}
							className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
						>
							<CategoryIcon category={transaction.category} />
							<span className="min-w-0 flex-1">
								<span className="block truncate font-medium">
									{transaction.merchant}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									<RelativeDate
										date={transaction.date}
										seenAt={transaction.createdAt}
									/>{" "}
									· {account?.name}
								</span>
							</span>
							<span
								className={cn(
									"font-medium tabular-nums",
									transaction.amount > 0 &&
										"text-emerald-600 dark:text-emerald-400"
								)}
							>
								<Money
									value={transaction.amount}
									currency={account?.currency}
									sign
								/>
							</span>
						</button>
					</WithContextMenu>
				)
			})}
		</>
	)
}
