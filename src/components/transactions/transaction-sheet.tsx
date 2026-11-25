import { Money } from "@/components/common/money"
import { useIncludeOverdraft } from "@/components/accounts/account-figures"
import type { PaymentDraft } from "@/components/goals/goal-form"
import { GoalPaymentDialog } from "@/components/goals/goal-payment-dialog"
import { CategoryIcon, RelativeDate } from "@/components/transactions/tx-bits"
import { CategorySelect } from "@/components/transactions/category-select"
import { TransactionSheetActions } from "@/components/transactions/transaction-sheet-actions"
import { TransactionSheetDetails } from "@/components/transactions/transaction-sheet-details"
import { TransactionSheetHistory } from "@/components/transactions/transaction-sheet-history"
import { useTransactionForm } from "@/components/transactions/use-transaction-form"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { Account, TaxTag, Transaction } from "@/lib/api"
import { TAX_TAG_LIST, TAX_TAG_META } from "@/lib/categories"
import { useGoals, useSubscriptions } from "@/lib/queries"
import { cn } from "cn"
import { useState } from "react"

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

	return (
		<>
			<GoalPaymentDialog draft={paying} onClose={() => setPaying(null)} />
			<Sheet
				open={!!transaction}
				onOpenChange={(open) => !open && onClose()}
			>
				<SheetContent className="w-full overflow-y-auto sm:max-w-md!">
					{transaction && form.history && (
						<>
							<SheetHeader className="gap-3 pb-0">
								<div className="flex items-center gap-3 pr-8">
									<CategoryIcon
										category={transaction.category}
										className="size-10"
									/>
									<div className="min-w-0">
										<SheetTitle className="truncate text-base">
											{transaction.merchant}
										</SheetTitle>
										<SheetDescription className="truncate">
											{account?.name}
										</SheetDescription>
									</div>
								</div>
								<div>
									<div
										className={cn(
											"text-3xl font-semibold tracking-tight tabular-nums",
											transaction.amount > 0 &&
												"text-emerald-600 dark:text-emerald-400"
										)}
									>
										<Money
											value={transaction.amount}
											currency={currency}
											sign
										/>
									</div>
									<div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
										<RelativeDate
											date={transaction.date}
											seenAt={transaction.createdAt}
										/>
										{transaction.pending && (
											<Badge variant="outline">
												Pending
											</Badge>
										)}
									</div>
								</div>
							</SheetHeader>

							<div className="grid gap-5 px-4 pb-6">
								<TransactionSheetDetails
									transaction={transaction}
									account={account}
									includeOverdraft={includeOverdraft}
								/>

								<div className="grid gap-2">
									<div className="flex items-center justify-between">
										<Label>Category</Label>
										{transaction.categorySource !==
											"auto" && (
											<button
												type="button"
												className="text-xs text-muted-foreground underline-offset-4 hover:underline"
												onClick={() =>
													void form.resetCategory()
												}
											>
												Reset to automatic
											</button>
										)}
									</div>
									<CategorySelect
										value={form.category}
										onChange={form.setCategory}
									/>
									<label className="flex items-center gap-2 text-sm">
										<Checkbox
											checked={form.applyAll}
											onCheckedChange={(checked) =>
												form.setApplyAll(
													checked === true
												)
											}
										/>
										Always use this for{" "}
										{transaction.merchant} (
										{form.history.count})
									</label>
								</div>

								<div className="grid gap-2">
									<div className="flex items-center justify-between">
										<Label>For taxes</Label>
										{transaction.taxTagSource ===
											"auto" && (
											<span className="text-xs text-muted-foreground">
												A payment for one of your bills
											</span>
										)}
									</div>
									<Tabs
										value={form.taxTag}
										onValueChange={(next) =>
											form.setTaxTag(
												next as TaxTag | "none"
											)
										}
									>
										<TabsList className="w-full">
											<TabsTrigger value="none">
												Untagged
											</TabsTrigger>
											{TAX_TAG_LIST.map((tag) => {
												const Icon =
													TAX_TAG_META[tag].icon
												return (
													<TabsTrigger
														key={tag}
														value={tag}
														title={
															TAX_TAG_META[tag]
																.hint
														}
													>
														<Icon />{" "}
														{
															TAX_TAG_META[tag]
																.label
														}
													</TabsTrigger>
												)
											})}
										</TabsList>
									</Tabs>
									{(form.taxTag !== "none" ||
										transaction.taxTagSource ===
											"rule") && (
										<label className="flex items-center gap-2 text-sm">
											<Checkbox
												checked={form.taxAll}
												onCheckedChange={(checked) =>
													form.setTaxAll(
														checked === true
													)
												}
											/>
											Always tag {transaction.merchant}{" "}
											this way ({form.history.count})
										</label>
									)}
								</div>

								<div className="grid gap-2">
									<Label htmlFor="tx-note">Note</Label>
									<Textarea
										id="tx-note"
										placeholder={
											form.taxTag === "business"
												? "What was it for? e.g. software for client work, lunch with a client…"
												: "Add a note — e.g. split with Sam, reimbursable…"
										}
										value={form.note}
										maxLength={500}
										onChange={(event) =>
											form.setNote(event.target.value)
										}
									/>
								</div>

								<TransactionSheetActions
									transaction={transaction}
									openGoals={openGoals}
									subs={subs}
									countedFor={countedFor}
									countedByHand={countedByHand}
									dirty={form.dirty}
									saving={form.saving}
									onSave={form.save}
									onPayGoal={setPaying}
									linked={linked}
								/>

								<Separator />

								<TransactionSheetHistory
									merchant={transaction.merchant}
									history={form.history}
									currency={currency}
									currentId={transaction.id}
									onSelect={onSelect}
								/>
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>
		</>
	)
}
