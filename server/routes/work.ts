import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { z } from "zod"
import {
  boundedArray,
  boundedString,
  currencyCode,
  id,
  isoDate,
  money,
  validate,
} from "../validation.ts"
import {
  fromCents,
  fromCentsOrNull,
  mulCents,
  toCents,
  toCentsOrNull,
} from "../../shared/money.ts"
import type { auth } from "../auth/index.ts"
import { db } from "../db.ts"
import { todayIso } from "../today.ts"
import {
  access,
  canEdit,
  forgetItem,
  listWithShared,
  viewOne,
} from "../sharing.ts"
import {
  roundHours,
  summarizeJob,
  type WorkEntryRow,
  type WorkInvoiceRow,
  type WorkJobRow,
  type WorkPaymentRow,
} from "../finance/work.ts"

type Vars = { Variables: { user: typeof auth.$Infer.Session.user } }
export const work = new Hono<Vars>()

const MAX_MONEY = 100_000_000

function loadJobs(userId: string, jobId?: string) {
  const where = jobId ? "user_id = ? AND id = ?" : "user_id = ?"
  const jobs = db
    .prepare(
      `SELECT id, name, rate, currency, pay_amount AS payAmount, pay_every_days AS payEveryDays, color, notes, archived,
              created_at AS createdAt
         FROM work_job WHERE ${where} ORDER BY archived, created_at`
    )
    .all(...(jobId ? [userId, jobId] : [userId])) as unknown as (Omit<
    WorkJobRow,
    "archived"
  > & { archived: number })[] // rate, payAmount in cents
  if (jobs.length === 0) return []
  const invoices = db
    .prepare(
      `SELECT i.id, i.job_id AS jobId, i.date, i.hours, i.rate, i.total, i.counter_hours AS counterHours,
              i.proof_url AS proofUrl, i.note, i.created_at AS createdAt
         FROM work_invoice i JOIN work_job j ON j.id = i.job_id WHERE j.user_id = ?`
    )
    .all(userId) as unknown as WorkInvoiceRow[] // rate, total in cents
  const entries = db
    .prepare(
      `SELECT e.id, e.job_id AS jobId, e.date, e.hours, e.note, e.invoice_id AS invoiceId, e.created_at AS createdAt
         FROM work_entry e JOIN work_job j ON j.id = e.job_id WHERE j.user_id = ?`
    )
    .all(userId) as unknown as WorkEntryRow[]
  const payments = db
    .prepare(
      `SELECT p.id, p.invoice_id AS invoiceId, p.amount, p.date, p.note, p.transaction_id AS transactionId,
              p.received_amount AS receivedAmount, p.received_currency AS receivedCurrency, p.created_at AS createdAt
         FROM work_payment p JOIN work_invoice i ON i.id = p.invoice_id JOIN work_job j ON j.id = i.job_id WHERE j.user_id = ?`
    )
    .all(userId) as unknown as WorkPaymentRow[] // amount, receivedAmount in cents
  const today = todayIso()
  return jobs.map((j) =>
    summarizeJob(
      {
        ...j,
        rate: fromCents(j.rate),
        payAmount: fromCentsOrNull(j.payAmount),
        archived: Boolean(j.archived),
      },
      invoices.map((i) => ({
        ...i,
        rate: fromCents(i.rate),
        total: fromCents(i.total),
      })),
      entries,
      payments.map((p) => ({
        ...p,
        amount: fromCents(p.amount),
        receivedAmount: fromCentsOrNull(p.receivedAmount),
      })),
      today
    )
  )
}

const jobFor = (ownerId: string, jobId: string) => loadJobs(ownerId, jobId)[0]
/** A job as the caller sees it (theirs, or shared with them). */
const viewJob = (userId: string, jobId: string) =>
  viewOne("job", userId, jobId, jobFor)

/** Owners and people a job is shared with for editing can log hours, bills and payments. */
const canEditJob = (userId: string, jobId: string) =>
  canEdit(access(userId, "job", jobId))

/**
 * Deleting bills, shifts and payments stays with the job's owner: 404 when the caller can't see
 * the job, 403 when it's only shared with them.
 */
function ownerDeleteDenied(userId: string, jobId: string): 403 | 404 | null {
  const a = access(userId, "job", jobId)
  if (!a) return 404
  return a.role === "owner" ? null : 403
}

const ONLY_OWNER = "Only the owner can delete this."
const ONLY_OWNER_LINKS = "Only the owner can link a bank transaction."

/** The job an invoice belongs to, if the caller can edit it. */
function invoiceJob(userId: string, invoiceId: string) {
  const row = db
    .prepare(`SELECT job_id AS jobId FROM work_invoice WHERE id = ?`)
    .get(invoiceId) as { jobId: string } | undefined
  if (row && !canEditJob(userId, row.jobId)) return undefined
  return row?.jobId ?? null
}

const ownsTransaction = (userId: string, txId: string) =>
  !!db
    .prepare(
      `SELECT 1 FROM bank_transaction t JOIN bank_account a ON a.id = t.account_id JOIN bank_connection c ON c.id = a.connection_id
        WHERE t.id = ? AND c.user_id = ?`
    )
    .get(txId, userId)

const note = boundedString(300).nullable().optional()
const idParam = z.object({ id: id })
const jobIdParam = z.object({ id: id })
const clean = (s: string | null | undefined) => s?.trim() || null
/** Only plain web links: a `javascript:` URL would run when clicked. */
const proofUrl = boundedString(500)
  .trim()
  .refine((s) => {
    if (s === "") return true
    try {
      const u = new URL(s)
      return u.protocol === "https:" || u.protocol === "http:"
    } catch {
      return false
    }
  }, "Use a web link (https://…)")
  .nullable()
  .optional()
const hours = z.number().positive().max(10_000)

work.get("/work", (c) =>
  c.json({
    jobs: listWithShared("job", c.var.user.id, (o) => loadJobs(o), jobFor),
  })
)

// ---------------------------------------------------------------- jobs

const jobBody = z.object({
  name: boundedString(80).trim().min(1),
  rate: money.refine((n) => n > 0 && n <= 100_000, "Rate out of range"),
  currency: currencyCode.default("CAD"),
  payAmount: money
    .refine((n) => n > 0 && n <= MAX_MONEY, "Amount out of range")
    .nullable()
    .optional(),
  payEveryDays: z.number().int().min(1).max(366).nullable().optional(),
  color: z
    .string()
    .regex(/^[a-z-]{1,32}$/)
    .default("ocean"),
  notes: boundedString(500).nullable().optional(),
  archived: z.boolean().default(false),
})
const patchJobBody = jobBody.partial()

work.post("/work/jobs", validate("json", jobBody), async (c) => {
  const d = c.req.valid("json")
  const jobId = randomUUID()
  db.prepare(
    `INSERT INTO work_job (id, user_id, name, rate, currency, pay_amount, pay_every_days, color, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    jobId,
    c.var.user.id,
    d.name,
    toCents(d.rate),
    d.currency.toUpperCase(),
    toCentsOrNull(d.payAmount),
    d.payEveryDays ?? null,
    d.color,
    clean(d.notes),
    d.archived ? 1 : 0
  )
  return c.json({ job: viewJob(c.var.user.id, jobId) })
})

work.patch(
  "/work/jobs/:id",
  validate("param", jobIdParam),
  validate("json", patchJobBody),
  async (c) => {
    const body = c.req.valid("json")
    const { id: jobId } = c.req.valid("param")
    const a = access(c.var.user.id, "job", jobId)
    if (!a) return c.json({ error: "Not found" }, 404)
    if (!canEdit(a))
      return c.json({ error: "You can only view this job." }, 403)
    if (a.role !== "owner") delete body.archived
    const cols: Record<string, string> = {
      name: "name",
      rate: "rate",
      currency: "currency",
      payAmount: "pay_amount",
      payEveryDays: "pay_every_days",
      color: "color",
      notes: "notes",
      archived: "archived",
    }
    const sets: string[] = []
    const vals: (string | number | null)[] = []
    for (const [k, col] of Object.entries(cols)) {
      const v = (body as Record<string, unknown>)[k]
      if (v === undefined) continue
      sets.push(`${col} = ?`)
      vals.push(
        typeof v === "boolean"
          ? v
            ? 1
            : 0
          : k === "notes"
            ? clean(v as string | null)
            : k === "rate" || k === "payAmount"
              ? toCentsOrNull(v as number | null)
              : (v as string | number | null)
      )
    }
    if (sets.length) {
      db.prepare(
        `UPDATE work_job SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
      ).run(...vals, jobId, a.ownerId)
    }
    const job = viewJob(c.var.user.id, jobId)
    return job ? c.json({ job }) : c.json({ error: "Not found" }, 404)
  }
)

work.delete("/work/jobs/:id", validate("param", jobIdParam), (c) => {
  const { id: jobId } = c.req.valid("param")
  const r = db
    .prepare(`DELETE FROM work_job WHERE id = ? AND user_id = ?`)
    .run(jobId, c.var.user.id)
  if (r.changes) forgetItem("job", jobId)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

// ---------------------------------------------------------------- shifts (unbilled hours)

const entryBody = z.object({ date: isoDate, hours, note })

work.post(
  "/work/jobs/:id/entries",
  validate("param", jobIdParam),
  validate("json", entryBody),
  async (c) => {
    const body = c.req.valid("json")
    const userId = c.var.user.id
    const { id: jobId } = c.req.valid("param")
    if (!canEditJob(userId, jobId)) return c.json({ error: "Not found" }, 404)
    const d = body
    db.prepare(
      `INSERT INTO work_entry (id, job_id, date, hours, note) VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), jobId, d.date, roundHours(d.hours), clean(d.note))
    return c.json({ job: viewJob(userId, jobId) })
  }
)

work.delete("/work/entries/:id", validate("param", idParam), (c) => {
  const userId = c.var.user.id
  const { id: entryId } = c.req.valid("param")
  const row = db
    .prepare(`SELECT job_id AS jobId FROM work_entry WHERE id = ?`)
    .get(entryId) as { jobId: string } | undefined
  const denied = row && ownerDeleteDenied(userId, row.jobId)
  if (!row || denied === 404) return c.json({ error: "Not found" }, 404)
  if (denied) return c.json({ error: ONLY_OWNER }, denied)
  db.prepare(`DELETE FROM work_entry WHERE id = ?`).run(entryId)
  return c.json({ job: viewJob(userId, row.jobId) })
})

// ---------------------------------------------------------------- bills

const invoiceBody = z.object({
  date: isoDate,
  hours,
  rate: money.refine((n) => n > 0 && n <= 100_000, "Rate out of range"),
  total: money
    .refine((n) => n >= 0 && n <= MAX_MONEY, "Total out of range")
    .optional(),
  counterHours: z.number().min(0).max(1_000_000).nullable().optional(),
  proofUrl,
  note,
  /** Logged shifts this bill covers; they stop counting as unbilled. */
  entryIds: boundedArray(id, 500).optional(),
})
const patchInvoiceBody = invoiceBody.omit({ entryIds: true }).partial()

work.post(
  "/work/jobs/:id/invoices",
  validate("param", jobIdParam),
  validate("json", invoiceBody),
  async (c) => {
    const body = c.req.valid("json")
    const userId = c.var.user.id
    const { id: jobId } = c.req.valid("param")
    if (!canEditJob(userId, jobId)) return c.json({ error: "Not found" }, 404)
    const d = body
    const invoiceId = randomUUID()
    db.exec("BEGIN")
    try {
      db.prepare(
        `INSERT INTO work_invoice (id, job_id, date, hours, rate, total, counter_hours, proof_url, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        invoiceId,
        jobId,
        d.date,
        roundHours(d.hours),
        toCents(d.rate),
        d.total === undefined
          ? mulCents(toCents(d.rate), roundHours(d.hours))
          : toCents(d.total),
        d.counterHours ?? null,
        clean(d.proofUrl),
        clean(d.note)
      )
      const attach = db.prepare(
        `UPDATE work_entry SET invoice_id = ? WHERE id = ? AND job_id = ? AND invoice_id IS NULL`
      )
      for (const entryId of d.entryIds ?? [])
        attach.run(invoiceId, entryId, jobId)
      db.exec("COMMIT")
    } catch (e) {
      db.exec("ROLLBACK")
      throw e
    }
    return c.json({ job: viewJob(userId, jobId) })
  }
)

work.patch(
  "/work/invoices/:id",
  validate("param", idParam),
  validate("json", patchInvoiceBody),
  async (c) => {
    const body = c.req.valid("json")
    const userId = c.var.user.id
    const { id: invoiceId } = c.req.valid("param")
    const jobId = invoiceJob(userId, invoiceId)
    if (!jobId) return c.json({ error: "Not found" }, 404)
    const cols: Record<string, string> = {
      date: "date",
      hours: "hours",
      rate: "rate",
      total: "total",
      counterHours: "counter_hours",
      proofUrl: "proof_url",
      note: "note",
    }
    const sets: string[] = []
    const vals: (string | number | null)[] = []
    for (const [k, col] of Object.entries(cols)) {
      const v = (body as Record<string, unknown>)[k]
      if (v === undefined) continue
      sets.push(`${col} = ?`)
      vals.push(
        k === "note" || k === "proofUrl"
          ? clean(v as string | null)
          : k === "rate" || k === "total"
            ? toCents(v as number)
            : (k === "hours" || k === "counterHours") && v !== null
              ? roundHours(v as number)
              : (v as string | number | null)
      )
    }
    if (sets.length)
      db.prepare(`UPDATE work_invoice SET ${sets.join(", ")} WHERE id = ?`).run(
        ...vals,
        invoiceId
      )
    return c.json({ job: viewJob(userId, jobId) })
  }
)

work.delete("/work/invoices/:id", validate("param", idParam), (c) => {
  const userId = c.var.user.id
  const { id: invoiceId } = c.req.valid("param")
  const jobId = invoiceJob(userId, invoiceId)
  if (!jobId) return c.json({ error: "Not found" }, 404)
  const denied = ownerDeleteDenied(userId, jobId)
  if (denied) return c.json({ error: ONLY_OWNER }, denied)
  db.prepare(`DELETE FROM work_invoice WHERE id = ?`).run(invoiceId)
  return c.json({ job: viewJob(userId, jobId) })
})

// ---------------------------------------------------------------- payments

const paymentBody = z.object({
  amount: money.refine((n) => n > 0 && n <= MAX_MONEY, "Amount out of range"),
  date: isoDate,
  note,
  transactionId: id.nullable().optional(),
  receivedAmount: money
    .refine((n) => n > 0 && n <= MAX_MONEY, "Amount out of range")
    .nullable()
    .optional(),
  receivedCurrency: currencyCode.nullable().optional(),
})

work.post(
  "/work/invoices/:id/payments",
  validate("param", idParam),
  validate("json", paymentBody),
  async (c) => {
    const d = c.req.valid("json")
    const userId = c.var.user.id
    const { id: invoiceId } = c.req.valid("param")
    const jobId = invoiceJob(userId, invoiceId)
    if (!jobId) return c.json({ error: "Not found" }, 404)
    // Only the owner's bank can be linked: an editor's transaction would be a foreign reference.
    if (d.transactionId) {
      if (access(userId, "job", jobId)?.role !== "owner")
        return c.json({ error: ONLY_OWNER_LINKS }, 403)
      if (!ownsTransaction(userId, d.transactionId))
        return c.json({ error: "Unknown transaction" }, 400)
    }
    const received =
      d.receivedAmount && d.receivedCurrency
        ? { amount: toCents(d.receivedAmount), currency: d.receivedCurrency }
        : null
    db.prepare(
      `INSERT INTO work_payment (id, invoice_id, amount, date, note, transaction_id, received_amount, received_currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      invoiceId,
      toCents(d.amount),
      d.date,
      clean(d.note),
      d.transactionId ?? null,
      received?.amount ?? null,
      received?.currency ?? null
    )
    return c.json({ job: viewJob(userId, jobId) })
  }
)

work.delete("/work/payments/:id", validate("param", idParam), (c) => {
  const userId = c.var.user.id
  const { id: paymentId } = c.req.valid("param")
  const row = db
    .prepare(
      `SELECT i.job_id AS jobId FROM work_payment p JOIN work_invoice i ON i.id = p.invoice_id WHERE p.id = ?`
    )
    .get(paymentId) as { jobId: string } | undefined
  const denied = row && ownerDeleteDenied(userId, row.jobId)
  if (!row || denied === 404) return c.json({ error: "Not found" }, 404)
  if (denied) return c.json({ error: ONLY_OWNER }, denied)
  db.prepare(`DELETE FROM work_payment WHERE id = ?`).run(paymentId)
  return c.json({ job: viewJob(userId, row.jobId) })
})
