import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderWithinDays } from './order.ts'

const tx = (id: string, amount: number, runningBalance: number | null, accountId = 'a', date = '2026-11-24') => ({
  id,
  accountId,
  date,
  amount,
  runningBalance,
})

test('reorders a day by running balance, newest first', () => {
  // Real order: Reid (+532.84 → 1395.09), Uber (−55.70 → 1339.39), e-Transfer (−100 → 1239.39).
  const rows = [tx('uber', -55.7, 1339.39), tx('reid', 532.84, 1395.09), tx('etf', -100, 1239.39), tx('old', 27.05, 862.25, 'a', '2026-11-23')]
  assert.deepEqual(
    orderWithinDays(rows).map((t) => t.id),
    ['etf', 'uber', 'reid', 'old'],
  )
})

test('only moves rows within their own account and day', () => {
  const rows = [tx('b1', -5, 100, 'b'), tx('a1', -10, 90), tx('a2', -10, 80)]
  assert.deepEqual(
    orderWithinDays(rows).map((t) => t.id),
    ['b1', 'a2', 'a1'],
  )
})

test('keeps the stored order when balances are missing or ambiguous', () => {
  const missing = [tx('x', -10, null), tx('y', -10, 90)]
  assert.deepEqual(orderWithinDays(missing).map((t) => t.id), ['x', 'y'])
  const broken = [tx('x', -10, 50), tx('y', -10, 90)]
  assert.deepEqual(orderWithinDays(broken).map((t) => t.id), ['x', 'y'])
})
