import type { PaymentDraft } from "@/components/goals/goal-form"
import { useTransactionForm } from "@/components/transactions/use-transaction-form"
import { useIncludeOverdraft } from "@/components/accounts/account-figures"
import type { Account, Transaction } from "@/lib/api"
import { useGoals, useSubscriptions } from "@/lib/queries"
import { useState } from "react"

/**
 * Open transaction sheet state: form, goal/subscription links, and currency.
 */
export function useTransactionSheet(
	transaction: Transaction | null,
	transactions: Transaction[],
	accounts: Account[],
	onUpdated: (transaction: Transaction, merchantWide: boolean) => void
) {
	const [paying, setPaying] = useState<PaymentDraft | null>(null)
	const form = useTransactionForm(transaction, transactions, onUpdated)
	const goals = useGoals().data?.goals
	const openGoals = (goals ?? []).filter(
		(goal) =>
			!goal.archived && goal.status !== "done" && goal.access === "owner"
	)
	const linked = transaction
		? (goals ?? []).filter((goal) =>
				goal.payments.some(
					(payment) => payment.transactionId === transaction.id
				)
			)
		: []
	const subs = (useSubscriptions().data?.subscriptions ?? []).filter(
		(subscription) => subscription.access === "owner"
	)
	const countedFor = transaction
		? subs.find((subscription) =>
				subscription.payments.some(
					(payment) => payment.id === transaction.id
				)
			)
		: undefined
	const countedByHand =
		!!transaction &&
		!!countedFor?.payments.find((payment) => payment.id === transaction.id)
			?.linked

	const account = accounts.find((row) => row.id === transaction?.accountId)
	const includeOverdraft = useIncludeOverdraft()
	const currency = account?.currency ?? "CAD"

	return {
		paying,
		setPaying,
		form,
		openGoals,
		linked,
		subs,
		countedFor,
		countedByHand,
		account,
		includeOverdraft,
		currency,
	}
}
