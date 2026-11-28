import { TransactionMenuItems } from "@/components/layout/app-context-menu"
import { AskLedgerButton } from "@/components/chat/ask-ledger-button"
import { transactionChargeAskPrompt } from "@/components/transactions/transactions-ask-prompt"
import { Hint } from "@/components/common/hint"
import { Money } from "@/components/common/money"
import {
	shownRunningBalance,
	useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { BriefcaseBusiness, StickyNote } from "lucide-react"
import type { BaseUIEvent } from "@base-ui/react/types"
import {
	type KeyboardEvent,
	memo,
	type MouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { CategoryBadge, CategoryIcon } from "@/components/transactions/tx-bits"
import { Badge } from "@/components/ui/badge"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
	createSharedTooltipHandle,
	type SharedTooltipHandle,
	Tooltip,
	TooltipContent,
} from "@/components/ui/tooltip"
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

type DayHeadingRowProps = {
	date: string
	colSpan: number
	tooltipHandle: SharedTooltipHandle
}

/** Sticky day divider row in the transactions table. */
const DayHeadingRow = memo(function DayHeadingRow({
	date,
	colSpan,
	tooltipHandle,
}: DayHeadingRowProps) {
	return (
		<TableRow className="border-b-0 bg-muted/40 hover:bg-muted/40">
			<TableCell
				colSpan={colSpan}
				className="px-4 py-1.5 text-xs font-medium text-muted-foreground"
			>
				<Hint
					label={formatLongDate(date)}
					side="right"
					handle={tooltipHandle}
				>
					<time dateTime={date} className="cursor-default">
						{formatDayHeading(date)}
					</time>
				</Hint>
			</TableCell>
		</TableRow>
	)
})

type TransactionRowProps = {
	transaction: Transaction
	account: Account | undefined
	picked: boolean
	showSelection: boolean
	showBalance: boolean
	showAccount: boolean
	includeOverdraft: boolean
	onSelect: (transaction: Transaction) => void
	onToggle: (transaction: Transaction, range: boolean) => void
	onRowKeyDown: (event: KeyboardEvent, transaction: Transaction) => void
	tooltipHandle: SharedTooltipHandle
}

/** One transaction line in the table (memoized so unrelated parent state does not re-render every row). */
const TransactionRow = memo(function TransactionRow({
	transaction,
	account,
	picked,
	showSelection,
	showBalance,
	showAccount,
	includeOverdraft,
	onSelect,
	onToggle,
	onRowKeyDown,
	tooltipHandle,
}: TransactionRowProps) {
	return (
		<TableRow
			data-tx-id={transaction.id}
			tabIndex={0}
			data-state={picked ? "selected" : undefined}
			className="cursor-pointer"
			onClick={() => onSelect(transaction)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault()
					onSelect(transaction)
					return
				}
				onRowKeyDown(event, transaction)
			}}
		>
			{showSelection && (
				<TableCell
					className="w-0 pr-0 pl-4"
					onClick={(clickEvent) => clickEvent.stopPropagation()}
				>
					<Checkbox
						aria-label={`Select ${transaction.merchant}`}
						checked={picked}
						onClick={(clickEvent) => {
							clickEvent.preventDefault()
							onToggle(transaction, clickEvent.shiftKey)
						}}
					/>
				</TableCell>
			)}
			<TableCell className="w-full max-w-0 pl-4">
				<div className="flex items-center gap-3">
					<CategoryIcon
						category={transaction.category}
						className="hidden sm:flex"
					/>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span className="truncate font-medium">
								{transaction.merchant}
							</span>
							{transaction.pending && (
								<Badge variant="outline" className="shrink-0">
									Pending
								</Badge>
							)}
							{transaction.taxTag === "business" && (
								<BriefcaseBusiness
									className="size-3.5 shrink-0 text-primary"
									aria-label="Business"
								/>
							)}
							{transaction.note && (
								<StickyNote
									className="size-3.5 shrink-0 text-muted-foreground"
									aria-label="Has note"
								/>
							)}
							<AskLedgerButton
								variant="compact"
								label="Ask About This Charge"
								prompt={transactionChargeAskPrompt(
									transaction,
									account?.currency
								)}
								handle={tooltipHandle}
							/>
						</div>
						<div className="truncate text-xs text-muted-foreground">
							{showAccount && account ? `${account.name} · ` : ""}
							{transaction.note || transaction.description}
						</div>
					</div>
				</div>
			</TableCell>
			<TableCell className="hidden md:table-cell">
				<CategoryBadge category={transaction.category} />
			</TableCell>
			<TableCell
				className={cn(
					"text-right font-medium tabular-nums",
					!showBalance && "pr-4",
					transaction.amount > 0 &&
						"text-emerald-600 dark:text-emerald-400",
					transaction.amount < 0 && "text-red-600 dark:text-red-400"
				)}
			>
				<Money
					value={transaction.amount}
					currency={account?.currency}
					sign
				/>
			</TableCell>
			{showBalance && (
				<TableCell className="hidden pr-4 text-right text-muted-foreground tabular-nums sm:table-cell">
					<Money
						value={shownRunningBalance(
							transaction,
							account,
							includeOverdraft
						)}
						currency={account?.currency}
					/>
				</TableCell>
			)}
		</TableRow>
	)
})

/** Transactions grouped under a heading per day (newest first, as given). */
export function TransactionsTable({
	transactions,
	accounts,
	onSelect,
	showBalance = false,
	showAccount = false,
	selection,
}: Props) {
	const includeOverdraft = useIncludeOverdraft()
	const tableRootRef = useRef<HTMLDivElement>(null)
	const [menuTransaction, setMenuTransaction] = useState<Transaction | null>(
		null
	)
	const tooltipHandleRef = useRef<SharedTooltipHandle | null>(null)
	if (tooltipHandleRef.current === null) {
		tooltipHandleRef.current = createSharedTooltipHandle()
	}
	const tooltipHandle = tooltipHandleRef.current
	const transactionsById = useMemo(
		() =>
			new Map(
				transactions.map((transaction) => [transaction.id, transaction])
			),
		[transactions]
	)
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

	const txIdsRef = useRef(txIds)
	txIdsRef.current = txIds

	const onRowKeyDown = useCallback(
		(event: KeyboardEvent, rowTransaction: Transaction) => {
			if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
				return
			}
			event.preventDefault()
			const ids = txIdsRef.current
			const index = ids.indexOf(rowTransaction.id)
			if (index < 0) {
				return
			}
			const next =
				event.key === "ArrowDown" ? ids[index + 1] : ids[index - 1]
			if (next) {
				focusTx(next)
			}
		},
		[focusTx]
	)

	const cols = 3 + (showBalance ? 1 : 0) + (selection ? 1 : 0)
	const showSelection = selection !== undefined

	const onSelectRef = useRef(onSelect)
	useEffect(() => {
		onSelectRef.current = onSelect
	})
	const stableOnSelect = useCallback((transaction: Transaction) => {
		onSelectRef.current(transaction)
	}, [])

	const onToggleRef = useRef(selection?.toggle)
	useEffect(() => {
		onToggleRef.current = selection?.toggle
	})
	const stableOnToggle = useCallback(
		(transaction: Transaction, range: boolean) => {
			onToggleRef.current?.(transaction, range)
		},
		[]
	)

	const onTableContextMenu = useCallback(
		(event: BaseUIEvent<MouseEvent<HTMLDivElement>>) => {
			const row = (event.target as Element).closest?.("[data-tx-id]")
			if (!row) {
				event.preventBaseUIHandler()
				setMenuTransaction(null)
				return
			}
			const id = row.getAttribute("data-tx-id")
			const transaction = id ? transactionsById.get(id) : undefined
			if (!transaction) {
				event.preventBaseUIHandler()
				setMenuTransaction(null)
				return
			}
			setMenuTransaction(transaction)
		},
		[transactionsById]
	)

	const menuAccount = menuTransaction
		? byId.get(menuTransaction.accountId)
		: undefined

	return (
		<ContextMenu
			onOpenChange={(open) => {
				if (!open) {
					setMenuTransaction(null)
				}
			}}
		>
			<Tooltip handle={tooltipHandle}>
				{({ payload }) => (
					<TooltipContent
						side={payload?.side ?? "top"}
						className={payload?.className}
					>
						{payload?.label}
					</TooltipContent>
				)}
			</Tooltip>
			<ContextMenuTrigger
				render={<div ref={tableRootRef} />}
				onContextMenu={onTableContextMenu}
			>
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_hsl(var(--border))]">
						<TableRow>
							{selection && (
								<TableHead className="sr-only">
									Selected
								</TableHead>
							)}
							<TableHead className="sr-only">Merchant</TableHead>
							<TableHead className="sr-only">Category</TableHead>
							<TableHead className="sr-only">Amount</TableHead>
							{showBalance && (
								<TableHead className="sr-only">
									Balance
								</TableHead>
							)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{flat.map((row) => {
							if (row.kind === "day") {
								return (
									<DayHeadingRow
										key={row.key}
										date={row.date}
										colSpan={cols}
										tooltipHandle={tooltipHandle}
									/>
								)
							}
							const rowTransaction = row.transaction
							const account = byId.get(rowTransaction.accountId)
							return (
								<TransactionRow
									key={row.key}
									transaction={rowTransaction}
									account={account}
									picked={
										selection?.ids.has(rowTransaction.id) ??
										false
									}
									showSelection={showSelection}
									showBalance={showBalance}
									showAccount={showAccount}
									includeOverdraft={includeOverdraft}
									onSelect={stableOnSelect}
									onToggle={stableOnToggle}
									onRowKeyDown={onRowKeyDown}
									tooltipHandle={tooltipHandle}
								/>
							)
						})}
					</TableBody>
				</Table>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				{menuTransaction && (
					<TransactionMenuItems
						transaction={menuTransaction}
						currency={menuAccount?.currency}
						onOpen={() => onSelect(menuTransaction)}
					/>
				)}
			</ContextMenuContent>
		</ContextMenu>
	)
}
