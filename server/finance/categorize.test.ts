import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addCycle, classify, detectRecurring, isCycle, monthlyEquivalent, nextDue, stripNoise, type TxLike } from './categorize.ts'

test('stripNoise removes TD suffixes, processor prefixes and store numbers', () => {
  assert.equal(stripNoise('UBER CANADA/UBE _V'), 'UBER CANADA')
  assert.equal(stripNoise('TIM HORTONS #2311 TORONTO'), 'TIM HORTONS')
  assert.equal(stripNoise('SQ *BLUE BOTTLE CAFE'), 'BLUE BOTTLE CAFE')
  assert.equal(stripNoise('FRESHCO 12345 ON'), 'FRESHCO')
})

test('classify recognises common merchants and categories', () => {
  const c = (d: string, a = -10) => classify(d, a)
  assert.deepEqual(
    [c('UBER CANADA/UBE _V').merchant, c('UBER CANADA/UBE _V').category],
    ['Uber', 'transport'],
  )
  assert.equal(c('UBER* EATS PENDING').category, 'food')
  assert.equal(c('USAT_WT210420 _M').category, 'food')
  assert.equal(c('TELUS MOBILITY').category, 'bills')
  assert.equal(c('NETFLIX.COM').category, 'subscriptions')
  assert.equal(c('AMAZON.CA PRIME MEMBER').merchant, 'Amazon Prime')
  assert.equal(c('AMAZON.CA').category, 'shopping')
  assert.equal(c('SEND E-TFR ***Jx4').category, 'transfers')
  assert.equal(c('SEND E-TFR ***Jx4').merchant, 'e-Transfer sent')
  assert.equal(c('E-TRANSFER ***abc', 50).merchant, 'e-Transfer received')
  assert.equal(c('MONTHLY ACCOUNT FEE').category, 'fees')
  assert.equal(c('OVERDRAFT INTEREST').category, 'fees')
  assert.equal(c('ACME CORP PAYROLL', 1500).category, 'income')
  assert.equal(c('ATM W/D 0123').category, 'cash')
  assert.equal(c('LOBLAWS 1234').category, 'groceries')
  assert.equal(c('SOME RANDOM PLACE').category, 'other')
  assert.equal(c('SOME RANDOM PLACE', 20).category, 'income')
  assert.equal(c('TIM HORTONS #99').merchantKey, c('TIM HORTONS #12').merchantKey)
})

test('addCycle keeps day of month and clamps short months', () => {
  assert.equal(addCycle('2026-01-31', 'monthly'), '2026-02-28')
  assert.equal(addCycle('2026-01-31', 'monthly', 2), '2026-03-31')
  assert.equal(addCycle('2026-11-24', 'weekly'), '2026-12-01')
  assert.equal(addCycle('2025-11-24', 'yearly'), '2026-11-24')
})

test('longer and custom billing periods', () => {
  assert.equal(addCycle('2024-02-29', 'biennial'), '2026-02-28')
  assert.equal(addCycle('2026-03-10', 'triennial'), '2029-03-10')
  assert.equal(addCycle('2026-01-15', 'semiannual'), '2026-07-15')
  assert.equal(addCycle('2026-01-15', 'every-5-years'), '2031-01-15')
  assert.equal(addCycle('2026-01-15', 'every-4-months'), '2026-05-15')
  assert.equal(addCycle('2026-01-01', 'every-3-weeks'), '2026-01-22')
  assert.equal(nextDue('2023-06-01', 'every-4-years', '2026-11-24'), '2027-06-01')
  assert.equal(monthlyEquivalent(240, 'biennial'), 10)
  assert.ok(isCycle('every-10-years') && isCycle('triennial'))
  assert.ok(!isCycle('every-0-years') && !isCycle('every-11-years') && !isCycle('every-2-days') && !isCycle('fortnightly'))
})

test('nextDue rolls an anchor forward to today or later', () => {
  assert.equal(nextDue('2026-01-15', 'monthly', '2026-11-24'), '2026-12-15')
  assert.equal(nextDue('2026-01-24', 'monthly', '2026-11-24'), '2026-11-24')
  assert.equal(nextDue('2027-02-01', 'monthly', '2026-11-24'), '2027-02-01')
})

test('monthlyEquivalent normalises cycles', () => {
  assert.equal(monthlyEquivalent(120, 'yearly'), 10)
  assert.equal(monthlyEquivalent(10, 'monthly'), 10)
})

test('detectRecurring finds monthly subscriptions and ignores noise', () => {
  const tx = (date: string, desc: string, amount: number): TxLike => ({ date, amount, ...classify(desc, amount) })
  const txs = [
    tx('2026-08-03', 'NETFLIX.COM', -16.49),
    tx('2026-09-03', 'NETFLIX.COM', -16.49),
    tx('2026-10-03', 'NETFLIX.COM', -18.99),
    tx('2026-11-03', 'NETFLIX.COM', -18.99),
    tx('2026-10-21', 'TELUS MOBILITY', -55),
    tx('2026-11-21', 'TELUS MOBILITY', -55),
    tx('2026-11-01', 'TIM HORTONS #1', -3),
    tx('2026-11-08', 'TIM HORTONS #1', -3),
    tx('2026-11-15', 'TIM HORTONS #1', -3),
    tx('2026-03-01', 'OLD GYM', -40),
    tx('2026-04-01', 'OLD GYM', -40),
    tx('2026-10-01', 'BIG STORE', -12),
    tx('2026-11-20', 'BIG STORE', -300),
  ]
  const found = detectRecurring(txs, '2026-11-24')
  assert.deepEqual(
    found.map((f) => [f.name, f.cycle, f.amount, f.nextDue]),
    [
      ['Netflix', 'monthly', 18.99, '2026-12-03'],
      ['Telus', 'monthly', 55, '2026-12-21'],
    ],
  )
})

test('stripNoise drops dates and foreign-currency amounts so keys stay stable', () => {
  assert.equal(stripNoise('PODP FEE SEP/10/2025'), 'PODP FEE')
  assert.equal(stripNoise('PODP FEE JAN/05/2026'), 'PODP FEE')
  assert.equal(stripNoise('CURSOR, AI 20.00_V'), 'CURSOR, AI')
  assert.equal(stripNoise('UBER CAN REV 11/20_V'), 'UBER CAN REV')
  // A glued suffix that isn't after a number is part of the name.
  assert.equal(stripNoise('UberDirectCA_PA _V'), 'UberDirectCA_PA')
  assert.equal(classify('UberDirectCA_PA _V', -11.29).merchant, 'Uber Direct')
})

test('stripNoise drops per-payment reference codes', () => {
  assert.equal(stripNoise('FAIRSTONE RF Y4U5X7'), 'FAIRSTONE')
  assert.equal(stripNoise('VIA RAIL/6WXCVQ'), 'VIA RAIL')
  assert.equal(classify('FAIRSTONE RF Y4U5X7', -475).merchantKey, classify('FAIRSTONE RF K9P2Q1', -475).merchantKey)
  // Words without digits are names, not codes.
  assert.equal(stripNoise('GIANT TIGER'), 'GIANT TIGER')
})

test('classify fixes for loans, transit and look-alike words', () => {
  assert.equal(classify('FAIRSTONE RF Y4U5X7', -475).category, 'debt')
  assert.equal(classify('LOAN PYMT', -200).category, 'debt')
  assert.equal(classify('METROLINX - GO _V', -10.2).category, 'transport')
  assert.equal(classify('GIANT TIGER #123', -18).category, 'shopping')
  // "OSHAWA" contains "shaw" (the cable company) but is not a bill.
  assert.notEqual(classify('OSHAWA - RITSON _V', -20).category, 'bills')
  assert.equal(classify('SHAW CABLE', -90).category, 'bills')
})

test('classify looks past payment processors', () => {
  assert.equal(classify('PAYPAL *APPLE.C _V', -4.51).merchant, 'Apple')
  assert.equal(classify('PAYPAL *SPOTIFY _V', -11.99).merchant, 'Spotify')
  assert.equal(classify('PAYPAL *NEWEGG _V', -40).category, 'shopping')
  assert.equal(classify('PAYPAL *DI 15.81_V', -16).merchantKey, 'paypal di')
  assert.equal(classify('PAYPAL *SOMEONE', 25).category, 'transfers')
  assert.equal(classify('PAYPAL *CINEPLE _V', -15).merchant, 'Cineplex')
})

test('detectRecurring separates plans from the same merchant', () => {
  const tx = (date: string, amount: number): TxLike => ({ date, amount, ...classify('PAYPAL *APPLE.C _V', amount) })
  const found = detectRecurring(
    [
      tx('2026-08-06', -4.51),
      tx('2026-09-06', -4.51),
      tx('2026-10-06', -4.51),
      tx('2026-11-06', -4.51),
      tx('2026-08-29', -13.55),
      tx('2026-09-29', -13.55),
      tx('2026-10-29', -13.55),
      tx('2026-09-15', -1.12), // one-off purchases in between
      tx('2026-10-20', -7.9),
    ],
    '2026-11-24',
  )
  assert.deepEqual(
    found.map((f) => [f.id, f.amount, f.occurrences]),
    [
      ['apple#14', 13.55, 3], // due 2026-11-29
      ['apple#5', 4.51, 4], // due 2026-12-06
    ],
  )
})

test('detectRecurring judges the recent rhythm and tolerates a skipped month', () => {
  const tx = (date: string): TxLike => ({ date, amount: -9.99, ...classify('SOME APP', -9.99) })
  const dates = ['2025-06-20', '2025-07-08', '2025-08-22', '2025-10-14', '2026-05-11', '2026-06-11', '2026-07-11', '2026-09-11', '2026-10-11', '2026-11-11']
  const found = detectRecurring(dates.map(tx), '2026-11-24')
  assert.deepEqual(found.map((f) => [f.name, f.cycle]), [['Some App', 'monthly']])
})

test('detectRecurring handles variable-amount charges on a schedule', () => {
  const tx = (date: string, amount: number): TxLike => ({ date, amount, ...classify('OVERDRAFT INTEREST', amount) })
  const found = detectRecurring(
    [tx('2026-07-31', -2.1), tx('2026-08-31', -4.74), tx('2026-09-29', -6.2), tx('2026-10-30', -3.71)],
    '2026-11-24',
  )
  assert.deepEqual(found.map((f) => [f.id, f.cycle, f.amount]), [['overdraft interest', 'monthly', 3.71]])
})

test('detectRecurring only flags everyday spending with an identical repeating amount', () => {
  const food = (date: string, amount: number, desc = 'DOORDASH DASHPASS'): TxLike => ({ date, amount, ...classify(desc, amount) })
  const found = detectRecurring(
    [
      food('2026-08-10', -9.99),
      food('2026-09-10', -9.99),
      food('2026-10-10', -9.99),
      food('2026-11-10', -9.99),
      // Regular-ish lunches at varying prices are not a subscription.
      food('2026-09-01', -12.4, 'PIZZA PLACE'),
      food('2026-10-01', -13.1, 'PIZZA PLACE'),
      food('2026-11-01', -12.9, 'PIZZA PLACE'),
      // Two identical charges aren't enough for food.
      food('2026-10-05', -5, 'CAFE ROYAL'),
      food('2026-11-05', -5, 'CAFE ROYAL'),
    ],
    '2026-11-24',
  )
  assert.deepEqual(found.map((f) => [f.name, f.category, f.amount]), [['DoorDash', 'food', 9.99]])
})
