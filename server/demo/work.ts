import { randomUUID } from "node:crypto"
import { db } from "../db.ts"
import { type Draft, iso, round } from "./util.ts"

/** A side job paid in weekly instalments: one bill cleared, one being paid off, one just sent, plus a few unbilled shifts. */
export function seedWork(today: Date, userId: string) {
  const ago = (days: number) =>
    iso(new Date(today.getTime() - days * 86_400_000))
  const jobId = randomUUID()
  db.prepare(
    `INSERT INTO work_job (id, user_id, name, rate, currency, pay_amount, pay_every_days, color, notes, created_at)
     VALUES (?, ?, 'Freelance design', 25, 'CAD', 250, 7, 'violet', 'Send the hours and total when billing.', ?)`
  ).run(jobId, userId, `${ago(90)} 12:00:00`)
  const insertInvoice = db.prepare(
    `INSERT INTO work_invoice (id, job_id, date, hours, rate, total, counter_hours, note, created_at) VALUES (?, ?, ?, ?, 25, ?, ?, ?, ?)`
  )
  const insertPayment = db.prepare(
    `INSERT INTO work_payment (id, invoice_id, amount, date, note, created_at) VALUES (?, ?, ?, ?, 'e-Transfer', ?)`
  )
  const bills: [
    daysAgo: number,
    hours: number,
    total: number,
    counter: number,
    note: string | null,
    payments: [daysAgo: number, amount: number][],
  ][] = [
    [
      70,
      40,
      1000,
      160,
      null,
      [
        [63, 250],
        [56, 250],
        [49, 250],
        [42, 250],
      ],
    ],
    [
      27,
      48,
      1150,
      208,
      "Agreed a flat total for this one",
      [
        [20, 250],
        [13, 250],
        [6, 250],
      ],
    ],
    [4, 36.5, 912.5, 244.5, null, []],
  ]
  for (const [daysAgo, hours, total, counter, note, payments] of bills) {
    const id = randomUUID()
    insertInvoice.run(
      id,
      jobId,
      ago(daysAgo),
      hours,
      total,
      counter,
      note,
      `${ago(daysAgo)} 12:00:00`
    )
    for (const [pAgo, amount] of payments)
      insertPayment.run(
        randomUUID(),
        id,
        amount,
        ago(pAgo),
        `${ago(pAgo)} 12:00:00`
      )
  }
  const insertEntry = db.prepare(
    `INSERT INTO work_entry (id, job_id, date, hours, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  )
  for (const [daysAgo, hours, note] of [
    [3, 3.5, "Staff meeting + tickets"],
    [1, 2.25, null],
  ] as const) {
    insertEntry.run(
      randomUUID(),
      jobId,
      ago(daysAgo),
      hours,
      note,
      `${ago(daysAgo)} 12:00:00`
    )
  }
}

/** A US client billed in USD through PayPal: one bill paid and converted to CAD on deposit, one part-paid, one open. */
const USD_BILLS: [
  daysAgo: number,
  hours: number,
  payments: [daysAgo: number, amount: number, receivedCad: number | null][],
][] = [
  [58, 22, [[50, 990, 1361.45]]],
  [
    30,
    18,
    [
      [24, 400, null],
      [10, 210, null],
    ],
  ],
  [5, 12.5, []],
]
const USD_RATE = 45

/** The USD PayPal wallet: client payments in, the first one transferred out (converted) to the bank. */
export function usdWallet(today: Date): Draft[] {
  const ago = (days: number) =>
    iso(new Date(today.getTime() - days * 86_400_000))
  const drafts: Draft[] = []
  for (const [, , payments] of USD_BILLS) {
    for (const [pAgo, amount, receivedCad] of payments) {
      drafts.push({
        date: ago(pAgo),
        description: "Payment from Brightline Media LLC",
        amount,
      })
      if (receivedCad != null)
        drafts.push({
          date: ago(pAgo - 1),
          description: "Transfer to bank (converted to CAD)",
          amount: -amount,
        })
    }
  }
  return drafts.sort((a, b) => a.date.localeCompare(b.date))
}

export function seedUsdJob(today: Date, userId: string) {
  const ago = (days: number) =>
    iso(new Date(today.getTime() - days * 86_400_000))
  const jobId = randomUUID()
  db.prepare(
    `INSERT INTO work_job (id, user_id, name, rate, currency, pay_amount, pay_every_days, color, notes, created_at)
     VALUES (?, ?, 'Brightline Media (US)', ?, 'USD', NULL, NULL, 'ocean', 'Billed in USD, paid through PayPal.', ?)`
  ).run(jobId, userId, USD_RATE, `${ago(75)} 12:00:00`)
  const insertInvoice = db.prepare(
    `INSERT INTO work_invoice (id, job_id, date, hours, rate, total, counter_hours, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`
  )
  const insertPayment = db.prepare(
    `INSERT INTO work_payment (id, invoice_id, amount, date, note, received_amount, received_currency, created_at) VALUES (?, ?, ?, ?, 'PayPal', ?, ?, ?)`
  )
  let counter = 0
  for (const [daysAgo, hours, payments] of USD_BILLS) {
    const id = randomUUID()
    counter += hours
    insertInvoice.run(
      id,
      jobId,
      ago(daysAgo),
      hours,
      USD_RATE,
      round(hours * USD_RATE),
      counter,
      `${ago(daysAgo)} 12:00:00`
    )
    for (const [pAgo, amount, receivedCad] of payments) {
      insertPayment.run(
        randomUUID(),
        id,
        amount,
        ago(pAgo),
        receivedCad,
        receivedCad == null ? null : "CAD",
        `${ago(pAgo)} 12:00:00`
      )
    }
  }
  db.prepare(
    `INSERT INTO work_entry (id, job_id, date, hours, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    jobId,
    ago(2),
    4,
    "Landing page revisions",
    `${ago(2)} 12:00:00`
  )
}
