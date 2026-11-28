import { DashboardHeroCard } from "@/components/dashboard/dashboard-hero-card"
import { DashboardInboxCard } from "@/components/dashboard/dashboard-inbox-card"
import { DashboardMonthSoFarCard } from "@/components/dashboard/dashboard-month-so-far-card"
import { DashboardProgressCard } from "@/components/dashboard/dashboard-progress-card"
import type { Account, Connection, Subscription, Transaction } from "@/lib/api"
import type { Converter } from "@/lib/currency"
import { inHomeCurrency } from "@/lib/currency"
import { type RangeKey } from "@/lib/ranges"

type SpendFigures = {
	now: number
	pending: number
	debt: number
	prev: number
}

/** Home dashboard content when at least one bank connection exists. */
export function DashboardConnected({
	connections,
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
	range,
	onRangeChange,
	upcoming,
}: {
	connections: Connection[]
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
	series: { date: string; balance: number }[]
	range: RangeKey
	onRangeChange: (range: RangeKey) => void
	upcoming: Subscription[]
}) {
	return (
		<div className="grid gap-4">
			<DashboardHeroCard
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
				series={series}
				range={range}
				onRangeChange={onRangeChange}
			/>
			<div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
				<DashboardInboxCard
					connections={connections}
					transactions={cadTx}
					converter={converter}
					upcoming={upcoming}
				/>
				<div className="grid gap-4">
					<DashboardMonthSoFarCard
						transactions={cadTx}
						txReady={txReady}
					/>
					<DashboardProgressCard />
				</div>
			</div>
		</div>
	)
}
