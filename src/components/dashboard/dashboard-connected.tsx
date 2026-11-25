import { AdvisorSpotlight } from "@/components/advisor/advisor-spotlight"
import { AnimatedMoney } from "@/components/common/count-up"
import { BalanceChart, CashflowChart } from "@/components/common/charts"
import { Money } from "@/components/common/money"
import { RangePicker } from "@/components/common/range-picker"
import { ConnectionSection } from "@/components/dashboard/connection-section"
import { DashboardStat } from "@/components/dashboard/dashboard-stat"
import { NeedsAttention } from "@/components/dashboard/needs-attention"
import { UpcomingList } from "@/components/dashboard/upcoming-list"
import { GoalsSpotlight } from "@/components/goals/goals-spotlight"
import {
	TransactionMenuItems,
	WithContextMenu,
} from "@/components/layout/app-context-menu"
import { CategoryIcon, RelativeDate } from "@/components/transactions/tx-bits"
import { buttonVariants } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Account, Connection, Subscription, Transaction } from "@/lib/api"
import type { Converter } from "@/lib/currency"
import { inHomeCurrency } from "@/lib/currency"
import { formatMoney } from "@/lib/format"
import { type RangeKey, rangeStart } from "@/lib/ranges"
import { cn } from "cn"
import { ChevronRight } from "lucide-react"
import { Link } from "@tanstack/react-router"

type SpendFigures = {
	now: number
	pending: number
	debt: number
	prev: number
}

/**
 * Dashboard body once at least one account exists: stats, charts, alerts, upcoming payments
 * and the connections list.
 */
export function DashboardConnected({
	connections,
	accounts,
	transactions,
	cad,
	cadTx,
	home,
	converter,
	net,
	overdraftTotal,
	available,
	overdraftRoom,
	owing,
	spend,
	txReady,
	series,
	flow,
	range,
	onRangeChange,
	upcoming,
	subscriptionCount,
	suggestionCount,
	onSelectTransaction,
	onRefreshConnection,
	onFullRefreshConnection,
	onUploadStatements,
	onToggleInstant,
	onForget,
	onRemove,
}: {
	connections: Connection[]
	accounts: Account[]
	transactions: Transaction[]
	cad: Account[]
	cadTx: Transaction[]
	home: ReturnType<typeof inHomeCurrency>
	converter: Converter
	net: number
	overdraftTotal: number
	available: number
	overdraftRoom: number
	owing: number
	spend: SpendFigures
	txReady: boolean
	series: Parameters<typeof BalanceChart>[0]["data"]
	flow: Parameters<typeof CashflowChart>[0]["data"]
	range: RangeKey
	onRangeChange: (range: RangeKey) => void
	upcoming: Subscription[]
	subscriptionCount: number
	suggestionCount: number
	onSelectTransaction: (transaction: Transaction) => void
	onRefreshConnection: (connection: Connection) => void
	onFullRefreshConnection: (connection: Connection) => void
	onUploadStatements: (connectionId: string) => void
	onToggleInstant: (connection: Connection) => void
	onForget: (connection: Connection) => void
	onRemove: (connection: Connection) => void
}) {
	return (
		<>
			<NeedsAttention
				connections={connections}
				transactions={cadTx}
				converter={converter}
			/>
			<GoalsSpotlight />
			<AdvisorSpotlight />
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<DashboardStat
					label="Total balance"
					value={<AnimatedMoney value={net} />}
					negative={net < 0}
					hint={
						overdraftTotal > 0
							? `Includes ${formatMoney(overdraftTotal)} of overdraft · ${cad.length} account${cad.length === 1 ? "" : "s"}`
							: `What you have minus what you owe, ${cad.length} account${cad.length === 1 ? "" : "s"}`
					}
					note={
						home.skipped.length > 0
							? `Leaves out ${home.skipped.join(", ")} accounts (no exchange rate yet)`
							: home.mixed
								? `In ${converter.home}, other currencies at today’s rates`
								: undefined
					}
				/>
				<DashboardStat
					label="Available to spend"
					value={<AnimatedMoney value={available} />}
					negative={available < 0}
					hint={
						overdraftRoom > 0
							? `Includes ${formatMoney(overdraftRoom)} of overdraft room`
							: "Across chequing, savings & wallets"
					}
				/>
				<DashboardStat
					label="Owing"
					value={<AnimatedMoney value={owing} />}
					hint="Credit, loans and overdraft in use"
				/>
				<DashboardStat
					label="Spent this month"
					value={txReady ? <AnimatedMoney value={spend.now} /> : "—"}
					hint={[
						spend.prev > 0
							? `${spend.now <= spend.prev ? "↓" : "↑"} ${formatMoney(Math.abs(spend.now - spend.prev))} vs same point last month`
							: "Excludes transfers & income",
						spend.pending > 0 &&
							`${formatMoney(spend.pending)} pending`,
						spend.debt > 0 &&
							`+ ${formatMoney(spend.debt)} loan payments`,
					]
						.filter(Boolean)
						.join(" · ")}
				/>
			</div>

			<div className="grid gap-4 lg:grid-cols-5">
				<Card className="lg:col-span-3">
					<CardHeader>
						<CardTitle>Total balance</CardTitle>
						<CardDescription>
							All accounts combined, end of day
						</CardDescription>
						<CardAction>
							<RangePicker
								value={range}
								onChange={onRangeChange}
								options={["30d", "90d", "6m", "1y"]}
							/>
						</CardAction>
					</CardHeader>
					<CardContent>
						{txReady ? (
							<BalanceChart
								data={series}
								from={rangeStart(range)}
							/>
						) : (
							<Skeleton className="h-56" />
						)}
					</CardContent>
				</Card>
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>Cash flow</CardTitle>
						<CardDescription>
							Money in vs out, last 6 months
						</CardDescription>
					</CardHeader>
					<CardContent>
						{txReady ? (
							<CashflowChart data={flow} />
						) : (
							<Skeleton className="h-56" />
						)}
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Upcoming payments</CardTitle>
						<CardDescription>
							Subscriptions & bills due in the next 2 weeks
						</CardDescription>
						<CardAction>
							<Link
								to="/subscriptions"
								className={buttonVariants({
									variant: "ghost",
									size: "sm",
								})}
							>
								View all <ChevronRight />
							</Link>
						</CardAction>
					</CardHeader>
					<CardContent>
						<UpcomingList
							items={upcoming}
							empty={subscriptionCount === 0}
							suggestions={suggestionCount}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Recent activity</CardTitle>
						<CardDescription>
							Latest across all accounts
						</CardDescription>
						<CardAction>
							<Link
								to="/insights"
								className={buttonVariants({
									variant: "ghost",
									size: "sm",
								})}
							>
								Insights <ChevronRight />
							</Link>
						</CardAction>
					</CardHeader>
					<CardContent className="grid gap-0.5">
						{txReady && transactions.length === 0 && (
							<p className="py-6 text-center text-sm text-muted-foreground">
								No transactions yet.
							</p>
						)}
						{transactions.slice(0, 6).map((transaction) => {
							const account = accounts.find(
								(candidate) =>
									candidate.id === transaction.accountId
							)
							return (
								<WithContextMenu
									key={transaction.id}
									menu={
										<TransactionMenuItems
											transaction={transaction}
											currency={account?.currency}
											onOpen={() =>
												onSelectTransaction(transaction)
											}
										/>
									}
								>
									<button
										type="button"
										onClick={() =>
											onSelectTransaction(transaction)
										}
										className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
									>
										<CategoryIcon
											category={transaction.category}
										/>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium">
												{transaction.merchant}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												<RelativeDate
													date={transaction.date}
													seenAt={
														transaction.createdAt
													}
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
					</CardContent>
				</Card>
			</div>

			{connections.map((connection) => (
				<ConnectionSection
					key={connection.id}
					connection={connection}
					accounts={accounts}
					onRefresh={onRefreshConnection}
					onFullRefresh={onFullRefreshConnection}
					onUploadStatements={onUploadStatements}
					onToggleInstant={onToggleInstant}
					onForget={onForget}
					onRemove={onRemove}
				/>
			))}
		</>
	)
}
