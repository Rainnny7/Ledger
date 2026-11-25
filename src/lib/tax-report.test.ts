import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Category, Transaction } from './api'
import { buildTaxReport, defaultReportYear, quarters, reportYears, toCsv } from './tax-report'

let n = 0
function tx(date: string, amount: number, category: Category, over: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${++n}`,
    accountId: 'chq',
    date,
    description: 'SHOP',
    amount,
    runningBalance: null,
    pending: false,
    note: null,
    createdAt: date,
    merchant: 'Shop',
    merchantKey: 'shop',
    category,
    categorySource: 'auto',
    taxTag: null,
    taxTagSource: null,
    ...over,
  }
}

test('transfers are left out and refunds lower spending', () => {
  const r = buildTaxReport([
    tx('2025-01-03', 3000, 'income'),
    tx('2025-01-05', -500, 'transfers'),
    tx('2025-01-08', -120, 'shopping'),
    tx('2025-01-10', 20, 'shopping'),
    tx('2025-02-01', -300, 'debt'),
  ])
  assert.equal(r.income, 3000)
  assert.equal(r.spending, 100)
  assert.equal(r.debtPayments, 300)
  assert.equal(r.count, 4)
  assert.ok(!r.byCategory.some((l) => l.category === 'transfers'))
})

test('business and personal are split, and loose ends are found', () => {
  const r = buildTaxReport([
    tx('2025-03-01', 1500, 'income', { taxTag: 'business' }),
    tx('2025-03-02', 900, 'income'),
    tx('2025-03-04', -60, 'subscriptions', { taxTag: 'business' }),
    tx('2025-03-05', -40, 'food', { taxTag: 'business', note: 'Client lunch' }),
    tx('2025-03-06', -25, 'other'),
    tx('2025-03-07', -10, 'food', { pending: true }),
  ])
  assert.equal(r.businessIn, 1500)
  assert.equal(r.businessOut, 100)
  assert.equal(r.personalOut, 35)
  assert.equal(r.review.untaggedIncome.length, 1)
  assert.equal(r.review.businessNoNote.length, 1)
  assert.equal(r.review.uncategorized.length, 1)
  assert.equal(r.review.pending.length, 1)
})

test('months roll up into quarters', () => {
  const r = buildTaxReport([tx('2025-01-10', -10, 'food'), tx('2025-03-10', -15, 'food'), tx('2025-04-01', -5, 'food')])
  assert.deepEqual(
    quarters(r.byMonth).map((q) => [q.quarter, q.moneyOut]),
    [
      ['2025 Q1', 25],
      ['2025 Q2', 5],
    ],
  )
})

test('the default year is last year during filing season', () => {
  const years = reportYears([tx('2025-06-01', -1, 'food')], new Date(2026, 2, 1))
  assert.deepEqual(years, [2026, 2025])
  assert.equal(defaultReportYear(years, new Date(2026, 2, 1)), 2025)
  assert.equal(defaultReportYear(years, new Date(2026, 10, 1)), 2026)
})

test('csv cells with commas, quotes and newlines are quoted', () => {
  assert.equal(toCsv([['a,b', 'say "hi"', 'x\ny', 3]]), '﻿"a,b","say ""hi""","x\ny",3\r\n')
})
