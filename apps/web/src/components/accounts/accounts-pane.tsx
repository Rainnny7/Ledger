import { Link } from "@tanstack/react-router"
import { AccountHeaderCard } from "@/components/accounts/account-header-card"
import { TransactionSheet } from "@/components/transactions/transaction-sheet"
import { TransactionsPageCard } from "@/components/transactions/transactions-page-card"
import { useTransactionsPage } from "@/components/transactions/use-transactions-page"
import { buttonVariants } from "@/components/ui/button-variants"
import { Card, CardContent } from "@/components/ui/card"
import { QueryError } from "@/components/ui/query-error"
import type { Connection } from "@/lib/api"

/**
 * Right pane of the Accounts page: the compact account header (when one account is picked) above
 * the single transactions card, plus the transaction sheet. Selection resets inside
 * `useTransactionsPage` when the route account changes.
 */
export function AccountsPane({
	accountId,
	connections,
}: {
	/** The account from the route, or null for "All accounts". */
	accountId: string | null
	connections: Connection[]
}) {
	const model = useTransactionsPage(accountId)
	const { account, txq } = model

	if (accountId && model.overview.data && !account) {
		return (
			<Card>
				<CardContent className="grid justify-items-center gap-3 py-10 text-center">
					<p className="text-sm text-muted-foreground">
						This account doesn’t exist or was removed.
					</p>
					<Link
						to="/accounts"
						className={buttonVariants({
							variant: "outline",
							size: "sm",
						})}
					>
						Back to all accounts
					</Link>
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="grid min-w-0 gap-4">
			{account ? (
				<AccountHeaderCard
					account={account}
					connection={connections.find(
						(connection) => connection.id === account.connectionId
					)}
					transactions={model.accountTransactions}
				/>
			) : null}

			{txq.error && !txq.data && (
				<QueryError
					message={txq.error.message}
					onRetry={() => void txq.reload()}
				/>
			)}

			<TransactionsPageCard model={model} />

			<TransactionSheet
				transaction={model.selected}
				transactions={model.transactions}
				accounts={model.accounts}
				onClose={() => model.setSelected(null)}
				onSelect={model.setSelected}
				onUpdated={(transaction) => model.setSelected(transaction)}
			/>
		</div>
	)
}
