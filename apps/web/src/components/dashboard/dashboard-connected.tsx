import { AdvisorSpotlight } from "@/components/advisor/advisor-spotlight"
import { BalanceChart, CashflowChart } from "@/components/common/charts"
import { RangePicker } from "@/components/common/range-picker"
import { ConnectionSection } from "@/components/dashboard/connection-section"
import { DashboardRecentActivity } from "@/components/dashboard/dashboard-recent-activity"
import { DashboardStatsGrid } from "@/components/dashboard/dashboard-stats-grid"
import { NeedsAttention } from "@/components/dashboard/needs-attention"
import { UpcomingList } from "@/components/dashboard/upcoming-list"
import { GoalsSpotlight } from "@/components/goals/goals-spotlight"
import { buttonVariants } from "@/components/ui/button-variants"
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
import { type RangeKey, rangeStart } from "@/lib/ranges"
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
			<DashboardStatsGrid
				cad={cad}
				home={home}
				converter={converter}
				net={net}
				overdraftTotal={overdraftTotal}
				available={available}
				overdraftRoom={overdraftRoom}
				owing={owing}
				spend={spend}
				txReady={txReady}
			/>

			<div className="grid gap-4 lg:grid-cols-5">
				<Card className="lg:col-span-3">
					<CardHeader>
						<CardTitle>Total Balance</CardTitle>
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
						<CardTitle>Cash Flow</CardTitle>
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
						<CardTitle>Upcoming Payments</CardTitle>
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
						<CardTitle>Recent Activity</CardTitle>
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
						<DashboardRecentActivity
							transactions={transactions}
							accounts={accounts}
							txReady={txReady}
							onSelectTransaction={onSelectTransaction}
						/>
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
