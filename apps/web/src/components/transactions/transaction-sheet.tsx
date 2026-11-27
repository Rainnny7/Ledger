import { GoalPaymentDialog } from "@/components/goals/goal-payment-dialog"
import { TransactionSheetOpen } from "@/components/transactions/transaction-sheet-open"
import { useTransactionSheet } from "@/components/transactions/use-transaction-sheet"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import type { Account, Transaction } from "@/lib/api"

interface Props {
	transaction: Transaction | null
	transactions: Transaction[]
	accounts: Account[]
	onClose: () => void
	onUpdated: (transaction: Transaction, merchantWide: boolean) => void
	onSelect: (transaction: Transaction) => void
}

/** React/UI entry: `TransactionSheet`. */
export function TransactionSheet({
	transaction,
	transactions,
	accounts,
	onClose,
	onUpdated,
	onSelect,
}: Props) {
	const sheet = useTransactionSheet(
		transaction,
		transactions,
		accounts,
		onUpdated
	)

	return (
		<>
			<GoalPaymentDialog
				draft={sheet.paying}
				onClose={() => sheet.setPaying(null)}
			/>
			<Sheet
				open={!!transaction}
				onOpenChange={(open) => !open && onClose()}
			>
				<SheetContent className="w-full overflow-y-auto sm:max-w-md!">
					{transaction && sheet.form.history && (
						<TransactionSheetOpen
							transaction={transaction}
							sheet={sheet}
							onSelect={onSelect}
						/>
					)}
				</SheetContent>
			</Sheet>
		</>
	)
}
