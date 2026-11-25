/**
 * Demo mode: a hidden, sign-in-less user filled with made-up banking data, so the app can be shown
 * off without revealing anyone's real finances. Requests carrying `X-Ledger-Demo: 1` read this
 * user's data instead of the caller's (see the /api/banks guard in index.ts); writes are refused.
 *
 * The data goes through the same saveScrape → categorise → recurring-detection path as a real
 * sync, so every page renders exactly as it would for a real account. It's regenerated once a day
 * so dates stay current.
 */
import { randomUUID } from 'node:crypto'
import { saveScrape } from './banks/store.ts'
import type { ScrapedAccount, ScrapedTransaction } from './banks/types.ts'
import { db, getSetting, setSetting } from './db.ts'
import { merchantKeyOf } from './finance/categorize.ts'

export const DEMO_USER_ID = 'ledger-demo'
export const DEMO_EMAIL = 'demo@ledger.invalid'
const SEED_VERSION = '5'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const round = (n: number) => Math.round(n * 100) / 100

/** Small deterministic PRNG so the demo looks the same every day (just shifted). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Draft {
  date: string
  description: string
  amount: number
}

function generate(today: Date) {
  const rand = rng(20240611)
  const between = (lo: number, hi: number) => round(lo + rand() * (hi - lo))
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const start = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth() - 1, 1))
  const chequing: Draft[] = []
  const savings: Draft[] = []
  const visa: Draft[] = []
  const paypal: Draft[] = []

  const end = iso(today)
  for (let d = new Date(start); iso(d) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = iso(d)
    const dom = d.getUTCDate()
    const dow = d.getUTCDay()
    const add = (list: Draft[], description: string, amount: number) => list.push({ date: day, description, amount })
    const daysSince = Math.round((d.getTime() - start.getTime()) / 86_400_000)

    // Income: bi-weekly pay on Fridays.
    if (dow === 5 && Math.floor(daysSince / 7) % 2 === 0) add(chequing, 'PAYROLL DEP NORTHWIND LABS', 2184.62)
    // Housing and bills.
    if (dom === 1) add(chequing, 'PARKVIEW PROPERTIES RENT', -1650)
    if (dom === 3) {
      add(chequing, 'TFR-TO SAVINGS 6243', -400)
      add(savings, 'TFR-FR CHEQUING 4417', 400)
    }
    if (dom === 8) add(chequing, 'ROGERS WIRELESS PAD', -85.4)
    if (dom === 12) add(chequing, 'HYDRO ONE NETWORKS', -between(72, 138))
    if (dom === 15) add(chequing, 'ENBRIDGE GAS PAD', -between(38, 96))
    if (dom === 20) add(chequing, 'MONTHLY PLAN FEE', -4.95)
    if (dom === 28) add(savings, 'INTEREST', round(6 + daysSince / 60))
    if (dom === 18 && daysSince > 20) {
      // Pay last month's card spending.
      const prev = visa
        .filter((t) => t.amount < 0 && t.date < day && t.date >= iso(new Date(d.getTime() - 31 * 86_400_000)))
        .reduce((s, t) => s - t.amount, 0)
      if (prev > 0) {
        add(chequing, 'TD VISA PAYMENT', -round(prev))
        add(visa, 'PAYMENT - THANK YOU', round(prev))
      }
    }

    // Subscriptions on the card.
    if (dom === 4) add(visa, 'NETFLIX.COM', -18.99)
    if (dom === 9) add(visa, 'SPOTIFY P1A2B3C4', -11.99)
    if (dom === 14) add(visa, 'APPLE.COM/BILL', -3.99)
    if (dom === 22) add(visa, 'GOODLIFE FITNESS', -54.99)
    if (dom === 26) add(visa, 'OPENAI *CHATGPT SUBSCR', -28.25)
    if (dom === 6 && d.getUTCMonth() === (today.getUTCMonth() + 5) % 12) add(visa, 'AMAZON PRIME MEMBERSHIP', -99)

    // Everyday spending.
    if (dow === 6 || (dow === 3 && rand() < 0.6)) add(visa, pick(['LOBLAWS #1123', 'METRO 457', 'NO FRILLS 3301', 'FARM BOY 18']), -between(42, 165))
    if (dom % 16 === 2) add(visa, 'COSTCO WHOLESALE W1270', -between(140, 260))
    if (dow >= 1 && dow <= 5 && rand() < 0.45) add(visa, pick(['TIM HORTONS #2231', 'STARBUCKS 04518', 'BALZAC\'S COFFEE']), -between(2.4, 7.8))
    if (rand() < 0.16) add(visa, pick(['UBER EATS', 'PIZZA NOVA 112', 'PHO HUNG', 'FIVE GUYS 1488', 'SUSHI MAKI BAR']), -between(18, 62))
    if (dow === 1 && rand() < 0.8) add(visa, 'PRESTO AUTOLOAD', -40)
    if (rand() < 0.07) add(visa, pick(['SHELL C01234', 'PETRO-CANADA 8812', 'ESSO 4471']), -between(48, 78))
    if (rand() < 0.04) add(visa, pick(['UBER TRIP', 'LYFT RIDE']), -between(14, 38))
    if (rand() < 0.09) add(visa, pick(['AMAZON.CA MKTPLACE', 'WINNERS 221', 'IKEA NORTH YORK', 'BEST BUY #934', 'INDIGO 0187']), -between(16, 140))
    if (rand() < 0.035) add(visa, pick(['CINEPLEX ENTMT', 'TICKETMASTER CA']), -between(19, 96))
    if (rand() < 0.03) add(visa, 'SHOPPERS DRUG MART 0921', -between(9, 46))

    // PayPal: online purchases, now and then a top-up from the bank.
    if (dom === 10 && d.getUTCMonth() % 2 === 0) add(paypal, 'Transfer in from bank/card', 100)
    if (rand() < 0.03) add(paypal, pick(['Steam', 'eBay seller', 'Bandcamp', 'Humble Bundle']), -between(6, 45))
  }

  return { chequing, savings, visa, paypal }
}

/** Running balances forward from an opening balance; newest first like a bank's own list. */
function finish(list: Draft[], opening: number): { transactions: ScrapedTransaction[]; balance: number } {
  let running = opening
  const transactions = list.map((t) => {
    running = round(running + t.amount)
    return { ...t, runningBalance: running, pending: false }
  })
  return { transactions: transactions.reverse(), balance: running }
}

function account(
  externalKey: string,
  name: string,
  type: ScrapedAccount['type'],
  numberMasked: string | null,
  opening: number,
  drafts: Draft[],
  extra: (balance: number) => Partial<ScrapedAccount> = () => ({}),
): ScrapedAccount {
  const { transactions, balance } = finish(drafts, opening)
  return {
    externalKey,
    name,
    type,
    numberMasked,
    currency: 'CAD',
    balance,
    available: balance,
    overdraftLimit: null,
    overdraftUsed: null,
    creditLimit: null,
    transactions,
    historyFrom: transactions.at(-1)?.date ?? null,
    details: null,
    ...extra(balance),
  }
}

function ensureDemoUser() {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
     VALUES (?, 'Alex Morgan', ?, 1, ?, ?, 'user', 1)
     ON CONFLICT (id) DO NOTHING`,
  ).run(DEMO_USER_ID, DEMO_EMAIL, now, now)
}

function seed(today: Date) {
  const { chequing, savings, visa, paypal } = generate(today)
  db.prepare(`DELETE FROM bank_connection WHERE user_id = ?`).run(DEMO_USER_ID)
  db.prepare(`DELETE FROM subscription WHERE user_id = ?`).run(DEMO_USER_ID)
  db.prepare(`DELETE FROM subscription_dismissed WHERE user_id = ?`).run(DEMO_USER_ID)
  db.prepare(`DELETE FROM category_rule WHERE user_id = ?`).run(DEMO_USER_ID)
  db.prepare(`DELETE FROM goal WHERE user_id = ?`).run(DEMO_USER_ID) // payments cascade
  db.prepare(`DELETE FROM work_job WHERE user_id = ?`).run(DEMO_USER_ID) // bills, shifts, payments cascade

  saveScrape({
    userId: DEMO_USER_ID,
    connectionId: null,
    institution: 'td',
    label: 'TD EasyWeb',
    usernameMasked: '•••• 2291',
    credentialsEnc: null,
    browserStateEnc: null,
    accounts: [
      account('demo:chq', 'TD Every Day Chequing', 'chequing', '•••4417', 1840.55, chequing, (b) => ({
        overdraftLimit: 500,
        overdraftUsed: 0,
        available: round(b + 500),
      })),
      account('demo:sav', 'TD ePremium Savings', 'savings', '•••6243', 7325.4, savings),
      account('demo:visa', 'TD Cash Back Visa', 'credit', '•••8830', -612.3, visa, (b) => ({
        creditLimit: 6000,
        available: round(6000 + b),
      })),
    ],
  })
  saveScrape({
    userId: DEMO_USER_ID,
    connectionId: null,
    institution: 'paypal',
    label: 'PayPal',
    usernameMasked: 'API app',
    credentialsEnc: null,
    browserStateEnc: null,
    accounts: [
      account('paypal:CAD', 'PayPal balance', 'wallet', null, 80.18, paypal),
      // US client payments land here (see seedWork); one was moved out and converted to CAD.
      account('paypal:USD', 'PayPal balance (USD)', 'wallet', null, 0, usdWallet(today), () => ({ currency: 'USD' })),
    ],
  })

  const visaId = (
    db.prepare(
      `SELECT a.id FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id WHERE c.user_id = ? AND a.external_key = 'demo:visa'`,
    ).get(DEMO_USER_ID) as { id: string }
  ).id
  const anchor = (dom: number) => iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, dom)))
  const subs: [name: string, amount: number, currency: string, cycle: string, anchor: string, category: string, merchant: string | null, account: string | null][] = [
    ['Netflix', 18.99, 'CAD', 'monthly', anchor(4), 'subscriptions', 'Netflix', visaId],
    ['Spotify', 11.99, 'CAD', 'monthly', anchor(9), 'subscriptions', 'Spotify', visaId],
    ['GoodLife Fitness', 54.99, 'CAD', 'monthly', anchor(22), 'health', 'Goodlife Fitness', visaId],
    ['Rogers Wireless', 85.4, 'CAD', 'monthly', anchor(8), 'bills', 'Rogers', null],
    ['ChatGPT Plus', 20, 'USD', 'monthly', anchor(26), 'subscriptions', 'OpenAI ChatGPT Subscr', visaId],
    ['GitHub Copilot', 100, 'USD', 'yearly', iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 4, 11))), 'subscriptions', null, null],
    ['Proton Mail', 47.88, 'EUR', 'yearly', iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 9, 3))), 'subscriptions', null, null],
    ['Domain renewal', 64, 'CAD', 'every-4-years', iso(new Date(Date.UTC(today.getUTCFullYear() - 2, 2, 17))), 'subscriptions', null, null],
    ['Antivirus', 89.99, 'CAD', 'biennial', iso(new Date(Date.UTC(today.getUTCFullYear() - 1, 9, 2))), 'subscriptions', null, null],
  ]
  const insert = db.prepare(
    `INSERT INTO subscription (id, user_id, name, amount, currency, cycle, anchor_date, category, account_id, merchant_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const [name, amount, currency, cycle, anchorDate, category, merchant, accountId] of subs) {
    insert.run(randomUUID(), DEMO_USER_ID, name, amount, currency, cycle, anchorDate, category, accountId, merchant ? merchantKeyOf(merchant) : null)
  }

  seedGoals(today)
  seedWork(today)
  seedUsdJob(today)
}

/** A few goals at different stages, with a history of partial payments. */
function seedGoals(today: Date) {
  const day = (monthsAgo: number, dom: number) =>
    iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsAgo, Math.min(dom, 28))))
  const ahead = (months: number) => day(-months, 15)
  const goals: {
    name: string
    kind: 'save' | 'payoff'
    target: number
    targetDate: string | null
    icon: string
    color: string
    notes: string | null
    createdMonthsAgo: number
    payments: [monthsAgo: number, dom: number, amount: number, note: string | null][]
  }[] = [
    {
      name: 'Japan trip',
      kind: 'save',
      target: 4500,
      targetDate: ahead(7),
      icon: 'plane',
      color: 'ocean',
      notes: 'Two weeks in Tokyo and Kyoto during cherry blossom season',
      createdMonthsAgo: 6,
      payments: [
        [6, 2, 600, 'Already saved'],
        [5, 5, 250, null],
        [4, 5, 250, null],
        [3, 5, 250, null],
        [3, 21, 180, 'Sold old bike'],
        [2, 5, 250, null],
        [1, 5, 250, null],
        [0, 5, 250, null],
      ],
    },
    {
      name: 'Emergency fund',
      kind: 'save',
      target: 6000,
      targetDate: null,
      icon: 'shield',
      color: 'forest',
      notes: 'Three months of rent and bills',
      createdMonthsAgo: 11,
      payments: [
        [11, 3, 1500, 'Already saved'],
        ...Array.from({ length: 11 }, (_, i): [number, number, number, string | null] => [10 - i, 3, 200, 'Monthly top-up']),
        [4, 18, -350, 'Car repair'],
      ],
    },
    {
      name: 'Pay off Visa',
      kind: 'payoff',
      target: 2400,
      targetDate: ahead(3),
      icon: 'credit-card',
      color: 'rose',
      notes: null,
      createdMonthsAgo: 4,
      payments: [
        [4, 19, 300, null],
        [3, 19, 300, null],
        [2, 19, 250, null],
        [1, 19, 300, null],
        [0, 2, 150, 'Bonus payment'],
      ],
    },
    {
      name: 'New laptop',
      kind: 'save',
      target: 1600,
      targetDate: day(1, 10),
      icon: 'laptop',
      color: 'violet',
      notes: null,
      createdMonthsAgo: 8,
      payments: [
        [8, 1, 400, 'Already saved'],
        [7, 1, 200, null],
        [6, 1, 200, null],
        [5, 1, 200, null],
        [4, 1, 200, null],
        [3, 1, 200, null],
        [2, 1, 200, null],
      ],
    },
  ]
  const insertGoal = db.prepare(
    `INSERT INTO goal (id, user_id, name, kind, target, target_date, icon, color, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertPayment = db.prepare(`INSERT INTO goal_payment (id, goal_id, amount, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
  const todayIso = iso(today)
  for (const g of goals) {
    const id = randomUUID()
    const created = day(g.createdMonthsAgo, 1)
    insertGoal.run(id, DEMO_USER_ID, g.name, g.kind, g.target, g.targetDate, g.icon, g.color, g.notes, `${created} 12:00:00`)
    for (const [monthsAgo, dom, amount, note] of g.payments) {
      const date = day(monthsAgo, dom)
      if (date > todayIso) continue
      insertPayment.run(randomUUID(), id, amount, date, note, `${date} 12:00:00`)
    }
  }
}

/** A side job paid in weekly instalments: one bill cleared, one being paid off, one just sent, plus a few unbilled shifts. */
function seedWork(today: Date) {
  const ago = (days: number) => iso(new Date(today.getTime() - days * 86_400_000))
  const jobId = randomUUID()
  db.prepare(
    `INSERT INTO work_job (id, user_id, name, rate, currency, pay_amount, pay_every_days, color, notes, created_at)
     VALUES (?, ?, 'Freelance design', 25, 'CAD', 250, 7, 'violet', 'Send the hours and total when billing.', ?)`,
  ).run(jobId, DEMO_USER_ID, `${ago(90)} 12:00:00`)
  const insertInvoice = db.prepare(
    `INSERT INTO work_invoice (id, job_id, date, hours, rate, total, counter_hours, note, created_at) VALUES (?, ?, ?, ?, 25, ?, ?, ?, ?)`,
  )
  const insertPayment = db.prepare(`INSERT INTO work_payment (id, invoice_id, amount, date, note, created_at) VALUES (?, ?, ?, ?, 'e-Transfer', ?)`)
  const bills: [daysAgo: number, hours: number, total: number, counter: number, note: string | null, payments: [daysAgo: number, amount: number][]][] = [
    [70, 40, 1000, 160, null, [[63, 250], [56, 250], [49, 250], [42, 250]]],
    [27, 48, 1150, 208, 'Agreed a flat total for this one', [[20, 250], [13, 250], [6, 250]]],
    [4, 36.5, 912.5, 244.5, null, []],
  ]
  for (const [daysAgo, hours, total, counter, note, payments] of bills) {
    const id = randomUUID()
    insertInvoice.run(id, jobId, ago(daysAgo), hours, total, counter, note, `${ago(daysAgo)} 12:00:00`)
    for (const [pAgo, amount] of payments) insertPayment.run(randomUUID(), id, amount, ago(pAgo), `${ago(pAgo)} 12:00:00`)
  }
  const insertEntry = db.prepare(`INSERT INTO work_entry (id, job_id, date, hours, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
  for (const [daysAgo, hours, note] of [[3, 3.5, 'Staff meeting + tickets'], [1, 2.25, null]] as const) {
    insertEntry.run(randomUUID(), jobId, ago(daysAgo), hours, note, `${ago(daysAgo)} 12:00:00`)
  }
}

/** A US client billed in USD through PayPal: one bill paid and converted to CAD on deposit, one part-paid, one open. */
const USD_BILLS: [daysAgo: number, hours: number, payments: [daysAgo: number, amount: number, receivedCad: number | null][]][] = [
  [58, 22, [[50, 990, 1361.45]]],
  [30, 18, [[24, 400, null], [10, 210, null]]],
  [5, 12.5, []],
]
const USD_RATE = 45

/** The USD PayPal wallet: client payments in, the first one transferred out (converted) to the bank. */
function usdWallet(today: Date): Draft[] {
  const ago = (days: number) => iso(new Date(today.getTime() - days * 86_400_000))
  const drafts: Draft[] = []
  for (const [, , payments] of USD_BILLS) {
    for (const [pAgo, amount, receivedCad] of payments) {
      drafts.push({ date: ago(pAgo), description: 'Payment from Brightline Media LLC', amount })
      if (receivedCad != null) drafts.push({ date: ago(pAgo - 1), description: 'Transfer to bank (converted to CAD)', amount: -amount })
    }
  }
  return drafts.sort((a, b) => a.date.localeCompare(b.date))
}

function seedUsdJob(today: Date) {
  const ago = (days: number) => iso(new Date(today.getTime() - days * 86_400_000))
  const jobId = randomUUID()
  db.prepare(
    `INSERT INTO work_job (id, user_id, name, rate, currency, pay_amount, pay_every_days, color, notes, created_at)
     VALUES (?, ?, 'Brightline Media (US)', ?, 'USD', NULL, NULL, 'ocean', 'Billed in USD, paid through PayPal.', ?)`,
  ).run(jobId, DEMO_USER_ID, USD_RATE, `${ago(75)} 12:00:00`)
  const insertInvoice = db.prepare(
    `INSERT INTO work_invoice (id, job_id, date, hours, rate, total, counter_hours, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  )
  const insertPayment = db.prepare(
    `INSERT INTO work_payment (id, invoice_id, amount, date, note, received_amount, received_currency, created_at) VALUES (?, ?, ?, ?, 'PayPal', ?, ?, ?)`,
  )
  let counter = 0
  for (const [daysAgo, hours, payments] of USD_BILLS) {
    const id = randomUUID()
    counter += hours
    insertInvoice.run(id, jobId, ago(daysAgo), hours, USD_RATE, round(hours * USD_RATE), counter, `${ago(daysAgo)} 12:00:00`)
    for (const [pAgo, amount, receivedCad] of payments) {
      insertPayment.run(randomUUID(), id, amount, ago(pAgo), receivedCad, receivedCad == null ? null : 'CAD', `${ago(pAgo)} 12:00:00`)
    }
  }
  db.prepare(`INSERT INTO work_entry (id, job_id, date, hours, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    randomUUID(), jobId, ago(2), 4, 'Landing page revisions', `${ago(2)} 12:00:00`,
  )
}

/** Make sure today's demo data exists. Cheap after the first call of the day. */
export function ensureDemoData() {
  const today = new Date()
  const stamp = `${SEED_VERSION}:${iso(today)}`
  if (getSetting('demo_seeded') === stamp && db.prepare(`SELECT 1 FROM user WHERE id = ?`).get(DEMO_USER_ID)) return
  ensureDemoUser()
  seed(today)
  setSetting('demo_seeded', stamp)
}
