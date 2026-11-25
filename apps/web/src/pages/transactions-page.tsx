import { TransactionSheet } from "@/components/transactions/transaction-sheet"
import { TransactionsPageCard } from "@/components/transactions/transactions-page-card"
import { useTransactionsPage } from "@/components/transactions/use-transactions-page"
import { FileSpreadsheet } from "lucide-react"
import { Link } from "@tanstack/react-router"

/** Every transaction on every account, searchable, with bulk recategorizing. */
export function TransactionsPage() {
	const model = useTransactionsPage()

	return (
		<div className="grid gap-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Transactions
				</h1>
				<p className="text-sm text-muted-foreground">
					Everything across your accounts. Tick a few to file them
					under one category, or tag them business or personal for{" "}
					<Link
						to="/taxes"
						className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
					>
						<FileSpreadsheet className="size-3.5" /> your tax report
					</Link>
					.
				</p>
			</div>

			{model.txq.error && (
				<p className="text-sm text-destructive">
					{model.txq.error.message}
				</p>
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
