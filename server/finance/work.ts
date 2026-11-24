/**
 * Hourly side work that gets paid in instalments: log hours, bill them ("done 40 hours since last
 * pay, total is $1,000"), then record each partial payment until the bill is cleared.
 */

export interface WorkJobRow {
  id: string
  name: string
  rate: number
  currency: string
  /** The usual instalment, e.g. $250 a week. */
  payAmount: number | null
  /** How often instalments arrive, in days (7 = weekly). */
  payEveryDays: number | null
  color: string
  notes: string | null
  archived: boolean
  createdAt: string
}

export interface WorkInvoiceRow {
  id: string
  jobId: string
  date: string
  hours: number
  rate: number
  total: number
  /** The time tracker's running total when this was billed. */
  counterHours: number | null
  proofUrl: string | null
  note: string | null
  createdAt: string
}

export interface WorkEntryRow {
  id: string
  jobId: string
  date: string
  hours: number
  note: string | null
  invoiceId: string | null
  createdAt: string
}

export interface WorkPaymentRow {
  id: string
  invoiceId: string
  amount: number
  date: string
  note: string | null
  transactionId: string | null
  createdAt: string
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid'

const round2 = (n: number) => Math.round(n * 100) / 100

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const byDate = <T extends { date: string; createdAt: string }>(a: T, b: T) =>
  a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)

export function summarizeInvoice(invoice: WorkInvoiceRow, payments: WorkPaymentRow[]) {
  const sorted = payments.filter((p) => p.invoiceId === invoice.id).sort(byDate)
  let left = invoice.total
  const withRunning = sorted.map((p) => {
    left = round2(left - p.amount)
    return { ...p, remainingAfter: Math.max(0, left) }
  })
  const paid = round2(sorted.reduce((s, p) => s + p.amount, 0))
  const remaining = Math.max(0, round2(invoice.total - paid))
  const status: InvoiceStatus = remaining <= 0.005 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
  return {
    ...invoice,
    paid,
    remaining,
    /** Overpaid by this much (a tip, or a mistake worth catching). */
    overpaid: Math.max(0, round2(paid - invoice.total)),
    status,
    progress: invoice.total > 0 ? Math.min(1, paid / invoice.total) : 1,
    paidAt: status === 'paid' ? (sorted.at(-1)?.date ?? invoice.date) : null,
    /** Oldest first, each with what was still owed after it. */
    payments: withRunning,
  }
}

export type WorkInvoice = ReturnType<typeof summarizeInvoice>

export function summarizeJob(
  job: WorkJobRow,
  invoices: WorkInvoiceRow[],
  entries: WorkEntryRow[],
  payments: WorkPaymentRow[],
  today: string,
) {
  const mine = invoices.filter((i) => i.jobId === job.id).sort(byDate)
  const summarized = mine.map((i) => summarizeInvoice(i, payments))
  const unbilled = entries.filter((e) => e.jobId === job.id && !e.invoiceId).sort(byDate).reverse()
  const unbilledHours = round2(unbilled.reduce((s, e) => s + e.hours, 0))
  const allPayments = summarized.flatMap((i) => i.payments).sort(byDate)
  const owed = round2(summarized.reduce((s, i) => s + i.remaining, 0))
  const month = today.slice(0, 7)
  const lastCounter = [...mine].reverse().find((i) => i.counterHours !== null)?.counterHours ?? null
  const lastPaymentDate = allPayments.at(-1)?.date ?? null

  // When the next instalment should land, and when the balance is cleared at the usual pace.
  let nextPaymentDate: string | null = null
  let paymentsLeft: number | null = null
  let payoffDate: string | null = null
  if (owed > 0 && job.payAmount && job.payAmount > 0 && job.payEveryDays && job.payEveryDays > 0) {
    const oldestOpen = summarized.find((i) => i.status !== 'paid')
    const base = [lastPaymentDate, oldestOpen?.date].filter((d): d is string => !!d).sort().at(-1) ?? today
    nextPaymentDate = addDays(base, job.payEveryDays)
    if (nextPaymentDate < today) nextPaymentDate = today
    paymentsLeft = Math.ceil(owed / job.payAmount - 1e-9)
    payoffDate = addDays(nextPaymentDate, (paymentsLeft - 1) * job.payEveryDays)
  }

  return {
    ...job,
    owed,
    billedHours: round2(mine.reduce((s, i) => s + i.hours, 0)),
    billedTotal: round2(mine.reduce((s, i) => s + i.total, 0)),
    paidTotal: round2(allPayments.reduce((s, p) => s + p.amount, 0)),
    paidThisMonth: round2(allPayments.filter((p) => p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0)),
    unbilledHours,
    unbilledValue: round2(unbilledHours * job.rate),
    /** The tracker's total at the last bill, so the next bill can work out "hours since". */
    lastCounter,
    lastPaymentDate,
    nextPaymentDate,
    paymentsLeft,
    payoffDate,
    /** Newest first. */
    invoices: summarized.reverse(),
    unbilled,
  }
}

export type WorkJob = ReturnType<typeof summarizeJob>
