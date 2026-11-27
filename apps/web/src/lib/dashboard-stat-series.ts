import type { Account, Transaction } from "@/lib/api"
import { balanceSeries, startOfMonth, totalSpent } from "@/lib/finance"
import { addDays, isoDate } from "@/lib/format"
import { rangeStart } from "@/lib/ranges"
import type { DashboardStatDelta } from "@/components/dashboard/dashboard-stat"

const STAT_RANGE = "30d" as const

function seriesValues(points: { balance: number }[]) {
	return points.map((point) => point.balance)
}

function balanceDelta(
	values: number[],
	goodWhenUp: boolean
): DashboardStatDelta | undefined {
	if (values.length < 2) {
		return undefined
	}
	const first = values[0]
	if (first === 0) {
		return undefined
	}
	const last = values[values.length - 1]
	const percent = ((last - first) / Math.abs(first)) * 100
	return { percent, label: "vs 30d ago", goodWhenUp }
}

function spendCumulativeSeries(transactions: Transaction[], today: Date) {
	const monthStart = startOfMonth(today)
	const todayIso = isoDate(today)
	const values: number[] = []
	for (let day = monthStart; day <= todayIso; day = addDays(day, 1)) {
		const slice = transactions.filter(
			(transaction) =>
				!transaction.pending &&
				transaction.date >= monthStart &&
				transaction.date <= day
		)
		values.push(totalSpent(slice))
	}
	return values
}

function spendMonthDelta(
	now: number,
	prev: number
): DashboardStatDelta | undefined {
	if (prev === 0) {
		return undefined
	}
	const percent = ((now - prev) / prev) * 100
	return {
		percent,
		label: "vs same point last month",
		goodWhenUp: false,
	}
}

/** Sparkline values and delta badges for the four dashboard stat cards. */
export function dashboardStatTrends({
	cad,
	deposit,
	transactions,
	includeOverdraft,
	now,
	spendNow,
	spendPrev,
}: {
	cad: Account[]
	deposit: Account[]
	transactions: Transaction[]
	includeOverdraft: boolean
	now: Date
	spendNow: number
	spendPrev: number
}) {
	const from = rangeStart(STAT_RANGE)
	const debtAccounts = cad.filter(
		(account) => account.type === "credit" || account.type === "loan"
	)

	const totalBalance = seriesValues(
		balanceSeries(cad, transactions, from, includeOverdraft)
	)
	const available = seriesValues(
		balanceSeries(deposit, transactions, from, includeOverdraft)
	)
	const owing = seriesValues(
		balanceSeries(debtAccounts, transactions, from, includeOverdraft)
	).map((value) => Math.abs(value))
	const spent = spendCumulativeSeries(transactions, now)

	return {
		series: {
			totalBalance,
			available,
			owing,
			spent,
		},
		delta: {
			totalBalance: balanceDelta(totalBalance, true),
			available: balanceDelta(available, true),
			owing: balanceDelta(owing, false),
			spent: spendMonthDelta(spendNow, spendPrev),
		},
	}
}
