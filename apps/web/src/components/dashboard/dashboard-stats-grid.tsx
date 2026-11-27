import { AnimatedMoney } from "@/components/common/count-up"
import { DashboardStat } from "@/components/dashboard/dashboard-stat"
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
	if (spend.prev > 0) {
		const direction = spend.now <= spend.prev ? "↓" : "↑"
		spentHintParts.push(
			`${direction} ${formatMoney(Math.abs(spend.now - spend.prev))} vs same point last month`
		)
	} else {
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
			/>
			<DashboardStat
				label="Available to Spend"
				value={<AnimatedMoney value={available} />}
				negative={available < 0}
				hint={availableHint}
			/>
			<DashboardStat
				label="Owing"
				value={<AnimatedMoney value={owing} />}
				hint="Credit, loans and overdraft in use"
			/>
			<DashboardStat
				label="Spent This Month"
				value={txReady ? <AnimatedMoney value={spend.now} /> : "—"}
				hint={spentHintParts.join(" · ")}
			/>
		</div>
	)
}
