import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Category, Transaction } from './api'
import { monthlyCashflow, spendByCategory, startOfMonth, topMerchants, totalDebtPaid, totalIncome, totalSpent } from './finance'

let n = 0
function tx(date: string, amount: number, category: Category, merchant = 'Shop', over: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${++n}`,
    accountId: 'chq',
    date,
    description: merchant.toUpperCase(),
    amount,
    runningBalance: null,
    pending: false,
    note: null,
    createdAt: date,
    merchant,
    merchantKey: merchant.toLowerCase(),
    category,
    categorySource: 'auto',
    taxTag: null,
    taxTagSource: null,
    ...over,
  }
}

test('a refund reduces spending instead of counting as income', () => {
  const txs = [tx('2026-11-02', -80, 'shopping'), tx('2026-11-05', 30, 'shopping'), tx('2026-11-01', 2000, 'income')]
  assert.equal(totalSpent(txs), 50)
  assert.equal(totalIncome(txs), 2000)
})

test('transfers and debt payments are not spending', () => {
  const txs = [tx('2026-11-02', -500, 'transfers'), tx('2026-11-03', -300, 'debt'), tx('2026-11-04', -20, 'food')]
  assert.equal(totalSpent(txs), 20)
  assert.equal(totalDebtPaid(txs), 300)
})

test('spendByCategory sorts by total and drops categories that net to zero', () => {
  const txs = [
    tx('2026-11-01', -10, 'food'),
    tx('2026-11-02', -40, 'groceries'),
    tx('2026-11-03', -15, 'food'),
    tx('2026-11-04', -25, 'shopping'),
    tx('2026-11-05', 25, 'shopping'),
  ]
  assert.deepEqual(spendByCategory(txs), [
    { category: 'groceries', total: 40, count: 1 },
    { category: 'food', total: 25, count: 2 },
  ])
})

test('topMerchants groups by merchant key and ignores money in', () => {
  const txs = [tx('2026-11-01', -5, 'food', 'Cafe'), tx('2026-11-02', -7.5, 'food', 'Cafe'), tx('2026-11-03', -3, 'food', 'Deli'), tx('2026-11-04', 9, 'food', 'Deli')]
  const top = topMerchants(txs)
  assert.deepEqual(
    top.map((m) => [m.merchant, m.total, m.count]),
    [
      ['Cafe', 12.5, 2],
      ['Deli', 3, 1],
    ],
  )
})

test('monthlyCashflow puts loan payments in money out and ignores other months', () => {
  const txs = [tx('2026-10-15', 1000, 'income'), tx('2026-10-20', -200, 'debt'), tx('2026-10-21', -100, 'food'), tx('2026-09-01', -999, 'food')]
  assert.deepEqual(monthlyCashflow(txs, ['2026-10']), [{ month: '2026-10', in: 1000, out: 300, debt: 200, net: 700 }])
})

test('startOfMonth gives the first day as an ISO date', () => {
  assert.equal(startOfMonth(new Date(2026, 1, 17)), '2026-02-01')
})
