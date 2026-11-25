import { roundMoney } from "@ledger/shared/money"
import { signedBalance } from "./balances.ts"
import type { Account, Category, Transaction } from "./api.ts"
import { NON_SPEND } from "./categories.ts"
import { addDays, isoDate } from "./format.ts"

/** Spending categories count toward "spent"; a refund in one of them reduces it. */
export const isSpend = (transaction: Transaction) =>
	!NON_SPEND.has(transaction.category)

/**
 * End-of-day combined balance for each day from `from` to today, reconstructed backwards from
 * today's balances: balance(d) = balance(today) − Σ posted amounts after d.
 */
export function balanceSeries(
	accounts: Account[],
	txs: Transaction[],
	from: string,
	includeOverdraft = false
) {
	const ids = new Set(accounts.map((account) => account.id))
	const byDate = new Map<string, number>()
	let earliest = isoDate()
	for (const transaction of txs) {
		if (transaction.pending || !ids.has(transaction.accountId)) {
			continue
		}
		byDate.set(
			transaction.date,
			(byDate.get(transaction.date) ?? 0) + transaction.amount
		)
		if (transaction.date < earliest) {
			earliest = transaction.date
		}
	}
	const start = from > earliest ? from : earliest
	const today = isoDate()
	let bal = accounts.reduce(
		(sum, account) => sum + signedBalance(account, includeOverdraft),
		0
	)
	const out: { date: string; balance: number }[] = []
	for (let day = today; day >= start; day = addDays(day, -1)) {
		out.push({ date: day, balance: roundMoney(bal) })
		bal -= byDate.get(day) ?? 0
	}
	return out.toReversed()
}

/** YYYY-MM from an ISO calendar date. */
export function monthKey(iso: string) {
	return iso.slice(0, 7)
}

/** Last `count` calendar months as YYYY-MM keys, oldest first. */
export function lastMonths(count: number) {
	const anchor = new Date()
	const keys: string[] = []
	for (let index = count - 1; index >= 0; index--) {
		const monthDate = new Date(
			anchor.getFullYear(),
			anchor.getMonth() - index,
			1
		)
		keys.push(
			`${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`
		)
	}
	return keys
}

/**
 * Money in vs out per month, on the same basis as the "Spent" and "Income" figures so the numbers
 * agree everywhere: in = net income, out = net spending + loan payments (refunds and reversals
 * cancel the charge they undo instead of inflating both sides). Transfers are ignored.
 */
export function monthlyCashflow(txs: Transaction[], months: string[]) {
	const map = new Map(
		months.map((month) => [month, { month, in: 0, spent: 0, debt: 0 }])
	)
	for (const transaction of txs) {
		const row = map.get(monthKey(transaction.date))
		if (!row) {
			continue
		}
		if (transaction.category === "income") {
			row.in += transaction.amount
		} else if (transaction.category === "debt") {
			row.debt -= transaction.amount
		} else if (isSpend(transaction)) {
			row.spent -= transaction.amount
		}
	}
	return [...map.values()].map((row) => {
		const inn = roundMoney(Math.max(0, row.in))
		const debt = roundMoney(Math.max(0, row.debt))
		const out = roundMoney(Math.max(0, row.spent) + debt)
		return {
			month: row.month,
			in: inn,
			out,
			debt,
			net: roundMoney(inn - out),
		}
	})
}

/** True when a transaction's posted date falls in `[from, to]` (inclusive). */
export function inRange(transaction: Transaction, from: string, to: string) {
	return transaction.date >= from && transaction.date <= to
}

/** Totals and counts per spending category (refunds reduce totals). */
export function spendByCategory(txs: Transaction[]) {
	const map = new Map<Category, { total: number; count: number }>()
	for (const transaction of txs) {
		if (!isSpend(transaction)) {
			continue
		}
		const row = map.get(transaction.category) ?? { total: 0, count: 0 }
		row.total -= transaction.amount
		row.count++
		map.set(transaction.category, row)
	}
	return [...map.entries()]
		.map(([category, row]) => ({
			category,
			total: roundMoney(row.total),
			count: row.count,
		}))
		.filter((line) => line.total > 0)
		.toSorted((left, right) => right.total - left.total)
}

/** Top merchants by spend amount in the period (charges only, not refunds). */
export function topMerchants(txs: Transaction[], limit = 8) {
	const map = new Map<
		string,
		{
			merchant: string
			merchantKey: string
			category: Category
			total: number
			count: number
		}
	>()
	for (const transaction of txs) {
		if (!isSpend(transaction) || transaction.amount >= 0) {
			continue
		}
		const row = map.get(transaction.merchantKey) ?? {
			merchant: transaction.merchant,
			merchantKey: transaction.merchantKey,
			category: transaction.category,
			total: 0,
			count: 0,
		}
		row.total -= transaction.amount
		row.count++
		map.set(transaction.merchantKey, row)
	}
	return [...map.values()]
		.map((row) => ({ ...row, total: roundMoney(row.total) }))
		.toSorted((left, right) => right.total - left.total)
		.slice(0, limit)
}

/** Net spending across spending categories (refunds net against charges). */
export function totalSpent(txs: Transaction[]) {
	return roundMoney(
		Math.max(
			0,
			txs.reduce(
				(sum, transaction) =>
					isSpend(transaction) ? sum - transaction.amount : sum,
				0
			)
		)
	)
}

/** Net income: pay and other money in, less any reversal of it. */
export function totalIncome(txs: Transaction[]) {
	return roundMoney(
		Math.max(
			0,
			txs.reduce(
				(sum, transaction) =>
					transaction.category === "income"
						? sum + transaction.amount
						: sum,
				0
			)
		)
	)
}

/** Net loan & debt repayments (money out to lenders, less any money in from them). */
export function totalDebtPaid(txs: Transaction[]) {
	return roundMoney(
		Math.max(
			0,
			txs.reduce(
				(sum, transaction) =>
					transaction.category === "debt"
						? sum - transaction.amount
						: sum,
				0
			)
		)
	)
}

/** Spending still pending (card holds that haven't posted yet). */
export function pendingSpent(txs: Transaction[]) {
	return roundMoney(
		Math.max(
			0,
			txs.reduce(
				(sum, transaction) =>
					transaction.pending && isSpend(transaction)
						? sum - transaction.amount
						: sum,
				0
			)
		)
	)
}

/** Only transactions on accounts in `accounts` (e.g. CAD ones, so currencies aren't summed together). */
export function onAccounts(txs: Transaction[], accounts: Account[]) {
	const ids = new Set(accounts.map((account) => account.id))
	return txs.filter((transaction) => ids.has(transaction.accountId))
}

/** ISO date for the first day of the month containing `date`. */
export function startOfMonth(date = new Date()) {
	return isoDate(new Date(date.getFullYear(), date.getMonth(), 1))
}

/** CSV with a UTF-8 BOM so Excel opens accents correctly. */
function csvEsc(value: string | number | null | undefined) {
	const text = value === null || value === undefined ? "" : String(value)
	return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Trigger a CSV download in the browser (UTF-8 BOM for Excel). */
export function downloadCsv(
	filename: string,
	rows: (string | number | null | undefined)[][]
) {
	const blob = new Blob(
		[`﻿${rows.map((row) => row.map(csvEsc).join(",")).join("\n")}`],
		{ type: "text/csv;charset=utf-8" }
	)
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = filename
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
