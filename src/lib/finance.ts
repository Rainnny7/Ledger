import { signedBalance } from './balances'
import type { Account, Category, Transaction } from './api'
import { NON_SPEND } from './categories'
import { addDays, isoDate } from './format'

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Spending categories count toward "spent"; a refund in one of them reduces it. */
export const isSpend = (t: Transaction) => !NON_SPEND.has(t.category)

/**
 * End-of-day combined balance for each day from `from` to today, reconstructed backwards from
 * today's balances: balance(d) = balance(today) − Σ posted amounts after d.
 */
export function balanceSeries(accounts: Account[], txs: Transaction[], from: string, includeOverdraft = false) {
  const ids = new Set(accounts.map((a) => a.id))
  const byDate = new Map<string, number>()
  let earliest = isoDate()
  for (const t of txs) {
    if (t.pending || !ids.has(t.accountId)) continue
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.amount)
    if (t.date < earliest) earliest = t.date
  }
  const start = from > earliest ? from : earliest
  const today = isoDate()
  let bal = accounts.reduce((s, a) => s + signedBalance(a, includeOverdraft), 0)
  const out: { date: string; balance: number }[] = []
  for (let d = today; d >= start; d = addDays(d, -1)) {
    out.push({ date: d, balance: round2(bal) })
    bal -= byDate.get(d) ?? 0
  }
  return out.reverse()
}

export function monthKey(iso: string) {
  return iso.slice(0, 7)
}

export function lastMonths(n: number) {
  const d = new Date()
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    keys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/**
 * Money in vs out per month, on the same basis as the "Spent" and "Income" figures so the numbers
 * agree everywhere: in = net income, out = net spending + loan payments (refunds and reversals
 * cancel the charge they undo instead of inflating both sides). Transfers are ignored.
 */
export function monthlyCashflow(txs: Transaction[], months: string[]) {
  const map = new Map(months.map((m) => [m, { month: m, in: 0, spent: 0, debt: 0 }]))
  for (const t of txs) {
    const row = map.get(monthKey(t.date))
    if (!row) continue
    if (t.category === 'income') row.in += t.amount
    else if (t.category === 'debt') row.debt -= t.amount
    else if (isSpend(t)) row.spent -= t.amount
  }
  return [...map.values()].map((r) => {
    const inn = round2(Math.max(0, r.in))
    const debt = round2(Math.max(0, r.debt))
    const out = round2(Math.max(0, r.spent) + debt)
    return { month: r.month, in: inn, out, debt, net: round2(inn - out) }
  })
}

export function inRange(t: Transaction, from: string, to: string) {
  return t.date >= from && t.date <= to
}

export function spendByCategory(txs: Transaction[]) {
  const map = new Map<Category, { total: number; count: number }>()
  for (const t of txs) {
    if (!isSpend(t)) continue
    const row = map.get(t.category) ?? { total: 0, count: 0 }
    row.total -= t.amount
    row.count++
    map.set(t.category, row)
  }
  return [...map.entries()]
    .map(([category, r]) => ({ category, total: round2(r.total), count: r.count }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

export function topMerchants(txs: Transaction[], limit = 8) {
  const map = new Map<string, { merchant: string; merchantKey: string; category: Category; total: number; count: number }>()
  for (const t of txs) {
    if (!isSpend(t) || t.amount >= 0) continue
    const row = map.get(t.merchantKey) ?? { merchant: t.merchant, merchantKey: t.merchantKey, category: t.category, total: 0, count: 0 }
    row.total -= t.amount
    row.count++
    map.set(t.merchantKey, row)
  }
  return [...map.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export function totalSpent(txs: Transaction[]) {
  return round2(Math.max(0, txs.reduce((s, t) => (isSpend(t) ? s - t.amount : s), 0)))
}

/** Net income: pay and other money in, less any reversal of it. */
export function totalIncome(txs: Transaction[]) {
  return round2(Math.max(0, txs.reduce((s, t) => (t.category === 'income' ? s + t.amount : s), 0)))
}

/** Net loan & debt repayments (money out to lenders, less any money in from them). */
export function totalDebtPaid(txs: Transaction[]) {
  return round2(Math.max(0, txs.reduce((s, t) => (t.category === 'debt' ? s - t.amount : s), 0)))
}

/** Spending still pending (card holds that haven't posted yet). */
export function pendingSpent(txs: Transaction[]) {
  return round2(Math.max(0, txs.reduce((s, t) => (t.pending && isSpend(t) ? s - t.amount : s), 0)))
}

/** Only transactions on accounts in `accounts` (e.g. CAD ones, so currencies aren't summed together). */
export function onAccounts(txs: Transaction[], accounts: Account[]) {
  const ids = new Set(accounts.map((a) => a.id))
  return txs.filter((t) => ids.has(t.accountId))
}

export function startOfMonth(d = new Date()) {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1))
}

/** CSV with a UTF-8 BOM so Excel opens accents correctly. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob([`﻿${rows.map((r) => r.map(esc).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
