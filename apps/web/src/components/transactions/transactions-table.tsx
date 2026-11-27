import {
	TransactionMenuItems,
	WithContextMenu,
} from "@/components/layout/app-context-menu"
import { AskLedgerButton } from "@/components/chat/ask-ledger-button"
import { transactionChargeAskPrompt } from "@/components/transactions/transactions-ask-prompt"
import { Hint } from "@/components/common/hint"
import { Money } from "@/components/common/money"
import {
	shownRunningBalance,
	useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { BriefcaseBusiness, StickyNote } from "lucide-react"
import { type KeyboardEvent, useCallback, useMemo, useRef } from "react"
import { CategoryBadge, CategoryIcon } from "@/components/transactions/tx-bits"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import type { Account, Transaction } from "@/lib/api"
import { formatDayHeading, formatLongDate } from "@/lib/format"
import { cn } from "cn"

interface Props {
	transactions: Transaction[]
	accounts: Account[]
	onSelect: (transaction: Transaction) => void
	showBalance?: boolean
	showAccount?: boolean
	/** Turns on a checkbox per row for picking several at once. */
	selection?: {
		ids: ReadonlySet<string>
		toggle: (transaction: Transaction, range: boolean) => void
	}
}

type FlatRow =
	| { kind: "day"; date: string; key: string }
	| { kind: "tx"; date: string; transaction: Transaction; key: string }

/** Transactions grouped under a heading per day (newest first, as given). */
export function TransactionsTable({
	transactions,
	accounts,
	onSelect,
	showBalance,
	showAccount,
	selection,
}: Props) {
	const includeOverdraft = useIncludeOverdraft()
	const tableRootRef = useRef<HTMLDivElement>(null)
	const byId = useMemo(
		() => new Map(accounts.map((account) => [account.id, account])),
		[accounts]
	)
	const flat = useMemo(() => {
		const out: FlatRow[] = []
		let lastDate: string | null = null
		for (const transaction of transactions) {
			if (transaction.date !== lastDate) {
				lastDate = transaction.date
				out.push({
					kind: "day",
					date: transaction.date,
					key: `d:${transaction.date}`,
				})
			}
			out.push({
				kind: "tx",
				date: transaction.date,
				transaction,
				key: `t:${transaction.id}`,
			})
		}
		return out
	}, [transactions])

	const txIds = useMemo(
		() =>
			flat
				.filter((row) => row.kind === "tx")
				.map((row) => row.transaction.id),
		[flat]
	)

	const focusTx = useCallback((id: string) => {
		const element = tableRootRef.current?.querySelector<HTMLElement>(
			`[data-tx-id="${id}"]`
		)
		element?.focus()
	}, [])

	const onRowKeyDown = useCallback(
		(event: KeyboardEvent, rowTransaction: Transaction) => {
			if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
				return
			}
			event.preventDefault()
			const index = txIds.indexOf(rowTransaction.id)
			if (index < 0) {
				return
			}
			const next =
				event.key === "ArrowDown" ? txIds[index + 1] : txIds[index - 1]
			if (next) {
				focusTx(next)
			}
		},
		[focusTx, txIds]
	)

	const cols = 3 + (showBalance ? 1 : 0) + (selection ? 1 : 0)

	return (
		<div ref={tableRootRef}>
			<Table>
				<TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_hsl(var(--border))]">
					<TableRow>
						{selection && (
							<TableHead className="sr-only">Selected</TableHead>
						)}
						<TableHead className="sr-only">Merchant</TableHead>
						<TableHead className="sr-only">Category</TableHead>
						<TableHead className="sr-only">Amount</TableHead>
						{showBalance && (
							<TableHead className="sr-only">Balance</TableHead>
						)}
					</TableRow>
				</TableHeader>
				<TableBody>
					{flat.map((row) => {
						if (row.kind === "day") {
							return (
								<TableRow
									key={row.key}
									className="border-b-0 bg-muted/40 hover:bg-muted/40"
								>
									<TableCell
										colSpan={cols}
										className="px-4 py-1.5 text-xs font-medium text-muted-foreground"
									>
										<Hint
											label={formatLongDate(row.date)}
											side="right"
										>
											<time
												dateTime={row.date}
												className="cursor-default"
											>
												{formatDayHeading(row.date)}
											</time>
										</Hint>
									</TableCell>
								</TableRow>
							)
						}
						const rowTransaction = row.transaction
						const account = byId.get(rowTransaction.accountId)
						return (
							<WithContextMenu
								key={row.key}
								menu={
									<TransactionMenuItems
										transaction={rowTransaction}
										currency={account?.currency}
										onOpen={() => onSelect(rowTransaction)}
									/>
								}
							>
								<TableRow
									data-tx-id={rowTransaction.id}
									tabIndex={0}
									data-state={
										selection?.ids.has(rowTransaction.id)
											? "selected"
											: undefined
									}
									className="cursor-pointer"
									onClick={() => onSelect(rowTransaction)}
									onKeyDown={(event) => {
										if (
											event.key === "Enter" ||
											event.key === " "
										) {
											event.preventDefault()
											onSelect(rowTransaction)
											return
										}
										onRowKeyDown(event, rowTransaction)
									}}
								>
									{selection && (
										<TableCell
											className="w-0 pr-0 pl-4"
											onClick={(clickEvent) =>
												clickEvent.stopPropagation()
											}
										>
											<Checkbox
												aria-label={`Select ${rowTransaction.merchant}`}
												checked={selection.ids.has(
													rowTransaction.id
												)}
												onClick={(clickEvent) => {
													clickEvent.preventDefault()
													selection.toggle(
														rowTransaction,
														clickEvent.shiftKey
													)
												}}
											/>
										</TableCell>
									)}
									<TableCell className="w-full max-w-0 pl-4">
										<div className="flex items-center gap-3">
											<CategoryIcon
												category={
													rowTransaction.category
												}
												className="hidden sm:flex"
											/>
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<span className="truncate font-medium">
														{
															rowTransaction.merchant
														}
													</span>
													{rowTransaction.pending && (
														<Badge
															variant="outline"
															className="shrink-0"
														>
															Pending
														</Badge>
													)}
													{rowTransaction.taxTag ===
														"business" && (
														<BriefcaseBusiness
															className="size-3.5 shrink-0 text-primary"
															aria-label="Business"
														/>
													)}
													{rowTransaction.note && (
														<StickyNote
															className="size-3.5 shrink-0 text-muted-foreground"
															aria-label="Has note"
														/>
													)}
													<AskLedgerButton
														variant="compact"
														label="Ask About This Charge"
														prompt={transactionChargeAskPrompt(
															rowTransaction,
															account?.currency
														)}
													/>
												</div>
												<div className="truncate text-xs text-muted-foreground">
													{showAccount && account
														? `${account.name} · `
														: ""}
													{rowTransaction.note ||
														rowTransaction.description}
												</div>
											</div>
										</div>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<CategoryBadge
											category={rowTransaction.category}
										/>
									</TableCell>
									<TableCell
										className={cn(
											"text-right font-medium tabular-nums",
											!showBalance && "pr-4",
											rowTransaction.amount > 0 &&
												"text-emerald-600 dark:text-emerald-400",
											rowTransaction.amount < 0 &&
												"text-red-600 dark:text-red-400"
										)}
									>
										<Money
											value={rowTransaction.amount}
											currency={account?.currency}
											sign
										/>
									</TableCell>
									{showBalance && (
										<TableCell className="hidden pr-4 text-right text-muted-foreground tabular-nums sm:table-cell">
											<Money
												value={shownRunningBalance(
													rowTransaction,
													account,
													includeOverdraft
												)}
												currency={account?.currency}
											/>
										</TableCell>
									)}
								</TableRow>
							</WithContextMenu>
						)
					})}
				</TableBody>
			</Table>
		</div>
	)
}
