import assert from "node:assert/strict"
import { test } from "node:test"
import {
  addDays,
  summarizeInvoice,
  summarizeJob,
  type WorkInvoiceRow,
  type WorkJobRow,
  type WorkPaymentRow,
} from "./work.ts"

const job = (over: Partial<WorkJobRow> = {}): WorkJobRow => ({
  id: "j",
  name: "Freelance design",
  rate: 25,
  currency: "CAD",
  payAmount: 250,
  payEveryDays: 7,
  color: "ocean",
  notes: null,
  archived: false,
  createdAt: "2026-01-01 12:00:00",
  ...over,
})
const invoice = (
  id: string,
  date: string,
  hours: number,
  over: Partial<WorkInvoiceRow> = {}
): WorkInvoiceRow => ({
  id,
  jobId: "j",
  date,
  hours,
  rate: 25,
  total: Math.round(hours * 25 * 100) / 100,
  counterHours: null,
  proofUrl: null,
  note: null,
  createdAt: `${date} 12:00:00`,
  ...over,
})
let n = 0
const pay = (
  invoiceId: string,
  date: string,
  amount: number
): WorkPaymentRow => ({
  id: `p${++n}`,
  invoiceId,
  amount,
  date,
  note: null,
  transactionId: null,
  createdAt: `${date} 12:00:00`,
})

test("instalments count down what is owed", () => {
  const inv = invoice("a", "2026-11-02", 60)
  assert.equal(inv.total, 1500)
  const s = summarizeInvoice(inv, [
    pay("a", "2026-11-03", 110),
    pay("a", "2026-11-10", 100),
  ])
  assert.equal(s.paid, 210)
  assert.equal(s.remaining, 1290)
  assert.equal(s.status, "partial")
  assert.deepEqual(
    s.payments.map((p) => p.remainingAfter),
    [1390, 1290]
  )
})

test("a bill is paid once the payments cover it", () => {
  const inv = invoice("b", "2026-10-01", 43.6)
  assert.equal(inv.total, 1090)
  const s = summarizeInvoice(inv, [
    pay("b", "2026-10-08", 940),
    pay("b", "2026-10-15", 150),
  ])
  assert.equal(s.status, "paid")
  assert.equal(s.remaining, 0)
  assert.equal(s.paidAt, "2026-10-15")
})

test("the payoff date follows the usual instalment", () => {
  const inv = invoice("c", "2026-11-02", 50, { total: 1150, counterHours: 200 })
  const s = summarizeJob(
    job(),
    [inv],
    [],
    [pay("c", "2026-11-09", 250), pay("c", "2026-11-16", 250)],
    "2026-11-18"
  )
  assert.equal(s.owed, 650)
  assert.equal(s.lastCounter, 200)
  assert.equal(s.nextPaymentDate, "2026-11-23")
  assert.equal(s.paymentsLeft, 3)
  assert.equal(s.payoffDate, "2026-12-07")
  assert.equal(s.paidThisMonth, 500)
})

test("unbilled shifts are totted up at the job rate", () => {
  const s = summarizeJob(
    job(),
    [],
    [
      {
        id: "e1",
        jobId: "j",
        date: "2026-11-20",
        hours: 3.5,
        note: null,
        invoiceId: null,
        createdAt: "2026-11-20 12:00:00",
      },
      {
        id: "e2",
        jobId: "j",
        date: "2026-11-21",
        hours: 2,
        note: null,
        invoiceId: "old",
        createdAt: "2026-11-21 12:00:00",
      },
    ],
    [],
    "2026-11-24"
  )
  assert.equal(s.unbilledHours, 3.5)
  assert.equal(s.unbilledValue, 87.5)
  assert.equal(s.nextPaymentDate, null)
})

test("addDays crosses month ends", () => {
  assert.equal(addDays("2026-11-28", 7), "2026-12-05")
})
