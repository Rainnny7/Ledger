import { ConnectDialog } from "@/components/accounts/connect-dialog"
import { DashboardConnected } from "@/components/dashboard/dashboard-connected"
import { DashboardEmptyState } from "@/components/dashboard/empty-state"
import { Greeting } from "@/components/dashboard/greeting"
import { StatementUploadDialog } from "@/components/accounts/statement-upload-dialog"
import { QueryError } from "@/components/ui/query-error"
import { Bones } from "@/components/common/bones"
import { Skeleton } from "@/components/ui/skeleton"
import {
	overdraftAllowance,
	signedBalance,
	useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { type RangeKey, rangeStart } from "@/lib/ranges"
import { useMemo, useState } from "react"
import type { Connection } from "@/lib/api"
import {
	balanceSeries,
	pendingSpent,
	startOfMonth,
	totalDebtPaid,
	totalSpent,
} from "@/lib/finance"
import { daysFromToday, formatMoney, isoDate } from "@/lib/format"
import { inHomeCurrency } from "@/lib/currency"
import { useConverter } from "@/lib/converter-provider"
import {
	useDashboardTransactions,
	useOverview,
	useSubscriptions,
} from "@/lib/queries"
import { useIntent } from "@/lib/url-state"
import { useNow } from "@/lib/use-now"
import { AskLedgerButton } from "@/components/chat/ask-ledger-button"

/** Home: net worth, inbox, and how the month is tracking. */
export function DashboardPage() {
	const { data, loading, error, reload } = useOverview()
	const [range, setRange] = useState<RangeKey>("90d")
	const txq = useDashboardTransactions(range)
	const subq = useSubscriptions()
	const [dialog, setDialog] = useState<{
		open: boolean
		connection: Connection | null
	}>({
		open: false,
		connection: null,
	})
	const [upload, setUpload] = useState<{
		open: boolean
		connectionId?: string
	}>({ open: false })
	useIntent("connect", () => setDialog({ open: true, connection: null }))
	useIntent("upload", () => setUpload({ open: true }))

	const connections = data?.connections ?? []
	const accounts = useMemo(() => data?.accounts ?? [], [data])
	const transactions = useMemo(() => txq.data?.transactions ?? [], [txq.data])
	const converter = useConverter()
	const home = useMemo(
		() => inHomeCurrency(accounts, transactions, converter),
		[accounts, transactions, converter]
	)
	const cad = home.accounts
	const deposit = useMemo(
		() =>
			cad.filter(
				(account) =>
					account.type === "chequing" ||
					account.type === "savings" ||
					account.type === "wallet"
			),
		[cad]
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
	const dateLine = now.toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	})
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
		<div className="grid gap-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm text-muted-foreground">
						{dateLine}
					</span>
					<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
						<Greeting />
					</h1>
				</div>
				<AskLedgerButton
					variant="tip"
					label="Summarize my month"
					prompt={`Summarize my finances for this calendar month. Net worth about ${formatMoney(net, converter.home)}, spending ${formatMoney(spend.now, converter.home)} so far vs ${formatMoney(spend.prev, converter.home)} on the same days last month. Call out top categories, subscriptions due soon, and goals progress.`}
				/>
			</div>

			{error && !data && (
				<QueryError
					message={error.message}
					onRetry={() => void reload()}
				/>
			)}

			<Bones
				name="dashboard"
				className="grid gap-4"
				loading={loading && !data}
				fallback={
					<div className="grid gap-4">
						<Skeleton className="h-64 rounded-xl" />
						<div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
							<Skeleton className="h-48 rounded-xl" />
							<div className="grid gap-4">
								<Skeleton className="h-36 rounded-xl" />
								<Skeleton className="h-36 rounded-xl" />
							</div>
						</div>
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
						range={range}
						onRangeChange={setRange}
						upcoming={upcoming}
					/>
				)}
			</Bones>

			<ConnectDialog
				open={dialog.open}
				connection={dialog.connection}
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
		</div>
	)
}
