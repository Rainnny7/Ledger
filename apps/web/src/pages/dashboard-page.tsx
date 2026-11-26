import { confirmDialog } from "@/lib/confirm"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import {
	overdraftAllowance,
	signedBalance,
	useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { ConnectDialog } from "@/components/accounts/connect-dialog"
import { DashboardConnected } from "@/components/dashboard/dashboard-connected"
import { DashboardEmptyState } from "@/components/dashboard/empty-state"
import { Greeting } from "@/components/dashboard/greeting"
import { type RangeKey, rangeStart } from "@/lib/ranges"
import { StatementUploadDialog } from "@/components/accounts/statement-upload-dialog"
import { TransactionSheet } from "@/components/transactions/transaction-sheet"
import { Button } from "@/components/ui/button"
import { QueryError } from "@/components/ui/query-error"
import { Bones } from "@/components/common/bones"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Connection, type Transaction } from "@/lib/api"
import {
	balanceSeries,
	lastMonths,
	monthlyCashflow,
	pendingSpent,
	startOfMonth,
	totalDebtPaid,
	totalSpent,
} from "@/lib/finance"
import { daysFromToday, isoDate } from "@/lib/format"
import { inHomeCurrency, useConverter } from "@/lib/currency"
import { demoMode } from "@/lib/demo"
import {
	useDashboardTransactions,
	useOverview,
	useSubscriptions,
} from "@/lib/queries"
import { useIntent } from "@/lib/url-state"
import { useNow } from "@/lib/use-now"

async function removeConnection(c: Connection) {
	if (
		!(await confirmDialog({
			title: `Remove ${c.label}?`,
			description:
				"Its accounts, transactions and saved login are deleted from Ledger. Your bank account itself isn’t touched.",
			action: "Remove",
			destructive: true,
		}))
	) {
		return
	}
	await api.deleteConnection(c.id)
	toast.success("Connection removed")
}

async function toggleInstant(c: Connection) {
	if (demoMode) {
		return toastError(
			"Demo mode is read-only. Exit demo mode to make changes."
		)
	}
	try {
		if (c.instantUpdates) {
			await api.disableInstantUpdates(c.id)
			toast.success("Instant updates turned off")
		} else {
			await api.enableInstantUpdates(c.id)
			toast.success("Instant updates on", {
				description:
					"PayPal will notify Ledger about payments made through your PayPal app, like invoice checkouts.",
			})
		}
	} catch (error) {
		toastError(
			error instanceof Error
				? error.message
				: "Could not change instant updates"
		)
	}
}

async function forgetCredentials(connection: Connection) {
	await api.forgetCredentials(connection.id)
	toast.success("Saved credentials deleted")
}

/** Home: balances, cash flow, budgets, and quick ways to connect or import. */
export function DashboardPage() {
	const { data, loading, error, reload } = useOverview()
	const [range, setRange] = useState<RangeKey>("90d")
	const txq = useDashboardTransactions(range)
	const subq = useSubscriptions()
	const [dialog, setDialog] = useState<{
		open: boolean
		connection: Connection | null
		full?: boolean
	}>({
		open: false,
		connection: null,
	})
	const [upload, setUpload] = useState<{
		open: boolean
		connectionId?: string
	}>({ open: false })
	// From the command palette.
	useIntent("connect", () => setDialog({ open: true, connection: null }))
	useIntent("upload", () => setUpload({ open: true }))
	const [selected, setSelected] = useState<Transaction | null>(null)

	const connections = data?.connections ?? []
	const accounts = useMemo(() => data?.accounts ?? [], [data])
	const transactions = useMemo(() => txq.data?.transactions ?? [], [txq.data])
	// Totals add up across currencies by restating every account in the home currency (today's rates).
	const converter = useConverter()
	const home = useMemo(
		() => inHomeCurrency(accounts, transactions, converter),
		[accounts, transactions, converter]
	)
	const cad = home.accounts
	const deposit = cad.filter(
		(account) =>
			account.type === "chequing" ||
			account.type === "savings" ||
			account.type === "wallet"
	)

	const includeOverdraft = useIncludeOverdraft()
	const net = cad.reduce(
		(sum, account) => sum + signedBalance(account, includeOverdraft),
		0
	)
	const overdraftTotal = includeOverdraft
		? deposit.reduce((sum, account) => sum + overdraftAllowance(account), 0)
		: 0
	const available = deposit.reduce(
		(sum, account) => sum + (account.available ?? account.balance ?? 0),
		0
	)
	const overdraftRoom = deposit.reduce(
		(sum, account) =>
			sum +
			Math.max(
				0,
				(account.available ?? 0) - Math.max(account.balance ?? 0, 0)
			),
		0
	)
	const owing =
		cad
			.filter(
				(account) =>
					account.type === "credit" || account.type === "loan"
			)
			.reduce((sum, account) => sum + Math.abs(account.balance ?? 0), 0) +
		deposit.reduce(
			(sum, account) => sum + Math.max(0, -(account.balance ?? 0)),
			0
		)

	const cadTx = home.transactions

	const now = useNow()
	const spend = useMemo(() => {
		const todayDate = now
		const today = isoDate(todayDate)
		const prevStart = startOfMonth(
			new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1)
		)
		const prevMonthDays = new Date(
			todayDate.getFullYear(),
			todayDate.getMonth(),
			0
		).getDate()
		// Same day-of-month last month, for a like-for-like comparison.
		const prevSameDay = isoDate(
			new Date(
				todayDate.getFullYear(),
				todayDate.getMonth() - 1,
				Math.min(todayDate.getDate(), prevMonthDays)
			)
		)
		const month = cadTx.filter(
			(transaction) =>
				transaction.date >= startOfMonth(todayDate) &&
				transaction.date <= today
		)
		return {
			now: totalSpent(month),
			pending: pendingSpent(month),
			debt: totalDebtPaid(month),
			prev: totalSpent(
				cadTx.filter(
					(transaction) =>
						transaction.date >= prevStart &&
						transaction.date <= prevSameDay
				)
			),
		}
	}, [cadTx, now])

	const series = useMemo(
		() => balanceSeries(cad, cadTx, rangeStart(range), includeOverdraft),
		[cad, cadTx, range, includeOverdraft]
	)
	const flow = useMemo(() => monthlyCashflow(cadTx, lastMonths(6)), [cadTx])
	const upcoming = useMemo(
		() =>
			(subq.data?.subscriptions ?? [])
				.filter(
					(subscription) =>
						subscription.active &&
						subscription.access === "owner" &&
						daysFromToday(subscription.nextDue) <= 14
				)
				.toSorted((left, right) =>
					left.nextDue.localeCompare(right.nextDue)
				),
		[subq.data]
	)

	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						<Greeting />
					</h1>
					<p className="text-sm text-muted-foreground">
						Balances, overdraft and activity from your linked banks.
					</p>
				</div>
				<Button
					onClick={() => setDialog({ open: true, connection: null })}
				>
					<Plus /> Add account
				</Button>
			</div>

			{error && !data && (
				<QueryError
					message={error.message}
					onRetry={() => void reload()}
				/>
			)}

			<Bones
				name="dashboard"
				className="grid gap-8"
				loading={loading && !data}
				fallback={
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{[0, 1, 2, 3].map((i) => (
							<Skeleton key={i} className="h-24 rounded-xl" />
						))}
					</div>
				}
			>
				{connections.length === 0 ? (
					<DashboardEmptyState
						onAdd={() =>
							setDialog({ open: true, connection: null })
						}
					/>
				) : (
					<DashboardConnected
						connections={connections}
						accounts={accounts}
						transactions={transactions}
						cad={cad}
						cadTx={cadTx}
						home={home}
						converter={converter}
						net={net}
						overdraftTotal={overdraftTotal}
						available={available}
						overdraftRoom={overdraftRoom}
						owing={owing}
						spend={spend}
						txReady={Boolean(txq.data)}
						series={series}
						flow={flow}
						range={range}
						onRangeChange={setRange}
						upcoming={upcoming}
						subscriptionCount={subq.data?.subscriptions.length ?? 0}
						suggestionCount={subq.data?.suggestions.length ?? 0}
						onSelectTransaction={setSelected}
						onRefreshConnection={(conn) =>
							setDialog({ open: true, connection: conn })
						}
						onFullRefreshConnection={(conn) =>
							setDialog({
								open: true,
								connection: conn,
								full: true,
							})
						}
						onUploadStatements={(connectionId) =>
							setUpload({ open: true, connectionId })
						}
						onToggleInstant={toggleInstant}
						onForget={forgetCredentials}
						onRemove={removeConnection}
					/>
				)}
			</Bones>

			<ConnectDialog
				open={dialog.open}
				connection={dialog.connection}
				full={dialog.full}
				onOpenChange={(open) =>
					setDialog((state) => ({ ...state, open }))
				}
				onUploadStatements={() => {
					setDialog((state) => ({ ...state, open: false }))
					setUpload({ open: true })
				}}
			/>

			<StatementUploadDialog
				open={upload.open}
				connectionId={upload.connectionId}
				onOpenChange={(open) =>
					setUpload((state) => ({ ...state, open }))
				}
			/>

			<TransactionSheet
				transaction={selected}
				transactions={transactions}
				accounts={accounts}
				onClose={() => setSelected(null)}
				onSelect={setSelected}
				onUpdated={(transaction) => setSelected(transaction)}
			/>
		</div>
	)
}
