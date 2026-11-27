import { AnimatedMoney } from "@/components/common/count-up"
import {
	DashboardStat,
	type DashboardStatDelta,
} from "@/components/dashboard/dashboard-stat"
import type { Account } from "@/lib/api"
import type { Converter } from "@/lib/currency"
import { inHomeCurrency } from "@/lib/currency"
import { formatMoney } from "@/lib/format"

type SpendFigures = {
	now: number
	pending: number
	debt: number
	prev: number
}

/** Top row of balance / spending summary cards on the dashboard. */
export function DashboardStatsGrid({
	cad,
	home,
	converter,
	net,
	overdraftTotal,
	available,
	overdraftRoom,
	owing,
	spend,
	txReady,
	statSeries,
	statDelta,
}: {
	cad: Account[]
	home: ReturnType<typeof inHomeCurrency>
	converter: Converter
	net: number
	overdraftTotal: number
	available: number
	overdraftRoom: number
	owing: number
	spend: SpendFigures
	txReady: boolean
	statSeries: {
		totalBalance: number[]
		available: number[]
		owing: number[]
		spent: number[]
	}
	statDelta: {
		totalBalance?: DashboardStatDelta
		available?: DashboardStatDelta
		owing?: DashboardStatDelta
		spent?: DashboardStatDelta
	}
}) {
	const accountCountLabel = `${cad.length} account${cad.length === 1 ? "" : "s"}`
	let totalBalanceHint: string
	if (overdraftTotal > 0) {
		totalBalanceHint = `Includes ${formatMoney(overdraftTotal)} of overdraft · ${accountCountLabel}`
	} else {
		totalBalanceHint = `What you have minus what you owe, ${accountCountLabel}`
	}

	let totalBalanceNote: string | undefined
	if (home.skipped.length > 0) {
		totalBalanceNote = `Leaves out ${home.skipped.join(", ")} accounts (no exchange rate yet)`
	} else if (home.mixed) {
		totalBalanceNote = `In ${converter.home}, other currencies at today’s rates`
	}

	let availableHint: string
	if (overdraftRoom > 0) {
		availableHint = `Includes ${formatMoney(overdraftRoom)} of overdraft room`
	} else {
		availableHint = "Across chequing, savings & wallets"
	}

	const spentHintParts: string[] = []
	if (!statDelta.spent) {
		spentHintParts.push("Excludes transfers & income")
	}
	if (spend.pending > 0) {
		spentHintParts.push(`${formatMoney(spend.pending)} pending`)
	}
	if (spend.debt > 0) {
		spentHintParts.push(`+ ${formatMoney(spend.debt)} loan payments`)
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<DashboardStat
				label="Total Balance"
				value={<AnimatedMoney value={net} />}
				negative={net < 0}
				hint={totalBalanceHint}
				note={totalBalanceNote}
				series={statSeries.totalBalance}
				delta={statDelta.totalBalance}
				showSparkline={txReady}
			/>
			<DashboardStat
				label="Available to Spend"
				value={<AnimatedMoney value={available} />}
				negative={available < 0}
				hint={availableHint}
				series={statSeries.available}
				delta={statDelta.available}
				showSparkline={txReady}
			/>
			<DashboardStat
				label="Owing"
				value={<AnimatedMoney value={owing} />}
				hint="Credit, loans and overdraft in use"
				series={statSeries.owing}
				delta={statDelta.owing}
				showSparkline={txReady}
			/>
			<DashboardStat
				label="Spent This Month"
				value={txReady ? <AnimatedMoney value={spend.now} /> : "—"}
				hint={spentHintParts.join(" · ") || undefined}
				series={statSeries.spent}
				delta={statDelta.spent}
				showSparkline={txReady}
			/>
		</div>
	)
}
