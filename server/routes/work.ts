import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { z } from "zod"
import { currencyCode, isoDate } from "../validation.ts"
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
  summarizeJob,
  type WorkEntryRow,
  type WorkInvoiceRow,
  type WorkJobRow,
  type WorkPaymentRow,
} from "../finance/work.ts"

type Vars = { Variables: { user: typeof auth.$Infer.Session.user } }
export const work = new Hono<Vars>()

const round2 = (n: number) => Math.round(n * 100) / 100
const MAX_MONEY = 100_000_000

function loadJobs(userId: string, id?: string) {
  const where = id ? "user_id = ? AND id = ?" : "user_id = ?"
  const jobs = db
    .prepare(
      `SELECT id, name, rate, currency, pay_amount AS payAmount, pay_every_days AS payEveryDays, color, notes, archived,
              created_at AS createdAt
         FROM work_job WHERE ${where} ORDER BY archived, created_at`
    )
    .all(...(id ? [userId, id] : [userId])) as unknown as (Omit<
    WorkJobRow,
    "archived"
  > & { archived: number })[]
  if (jobs.length === 0) return []
  const invoices = db
    .prepare(
      `SELECT i.id, i.job_id AS jobId, i.date, i.hours, i.rate, i.total, i.counter_hours AS counterHours,
              i.proof_url AS proofUrl, i.note, i.created_at AS createdAt
         FROM work_invoice i JOIN work_job j ON j.id = i.job_id WHERE j.user_id = ?`
    )
    .all(userId) as unknown as WorkInvoiceRow[]
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
    .all(userId) as unknown as WorkPaymentRow[]
  const today = todayIso()
  return jobs.map((j) =>
    summarizeJob(
      { ...j, archived: Boolean(j.archived) },
      invoices,
      entries,
      payments,
      today
    )
  )
}

const jobFor = (ownerId: string, id: string) => loadJobs(ownerId, id)[0]
/** A job as the caller sees it (theirs, or shared with them). */
const viewJob = (userId: string, id: string) =>
  viewOne("job", userId, id, jobFor)

/** Owners and people a job is shared with for editing can log hours, bills and payments. */
const canEditJob = (userId: string, jobId: string) =>
  canEdit(access(userId, "job", jobId))

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

const note = z.string().max(300).nullable().optional()
const clean = (s: string | null | undefined) => s?.trim() || null
/** Only plain web links: a `javascript:` URL would run when clicked. */
const proofUrl = z
  .string()
  .trim()
  .max(500)
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
  name: z.string().trim().min(1).max(80),
  rate: z.number().positive().max(100_000),
  currency: currencyCode.default("CAD"),
  payAmount: z.number().positive().max(MAX_MONEY).nullable().optional(),
  payEveryDays: z.number().int().min(1).max(366).nullable().optional(),
  color: z
    .string()
    .regex(/^[a-z-]{1,32}$/)
    .default("ocean"),
  notes: z.string().max(500).nullable().optional(),
  archived: z.boolean().default(false),
})

work.post("/work/jobs", async (c) => {
  const body = jobBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the job details." }, 400)
  const d = body.data
  const id = randomUUID()
  db.prepare(
    `INSERT INTO work_job (id, user_id, name, rate, currency, pay_amount, pay_every_days, color, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    c.var.user.id,
    d.name,
    d.rate,
    d.currency.toUpperCase(),
    d.payAmount ?? null,
    d.payEveryDays ?? null,
    d.color,
    clean(d.notes),
    d.archived ? 1 : 0
  )
  return c.json({ job: viewJob(c.var.user.id, id) })
})

work.patch("/work/jobs/:id", async (c) => {
  const body = jobBody.partial().safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the job details." }, 400)
  const a = access(c.var.user.id, "job", c.req.param("id"))
  if (!a) return c.json({ error: "Not found" }, 404)
  if (!canEdit(a)) return c.json({ error: "You can only view this job." }, 403)
  if (a.role !== "owner") delete body.data.archived
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
    const v = (body.data as Record<string, unknown>)[k]
    if (v === undefined) continue
    sets.push(`${col} = ?`)
    vals.push(
      typeof v === "boolean"
        ? v
          ? 1
          : 0
        : k === "notes"
          ? clean(v as string | null)
          : (v as string | number | null)
    )
  }
  if (sets.length) {
    db.prepare(
      `UPDATE work_job SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
    ).run(...vals, c.req.param("id"), a.ownerId)
  }
  const job = viewJob(c.var.user.id, c.req.param("id"))
  return job ? c.json({ job }) : c.json({ error: "Not found" }, 404)
})

work.delete("/work/jobs/:id", (c) => {
  const r = db
    .prepare(`DELETE FROM work_job WHERE id = ? AND user_id = ?`)
    .run(c.req.param("id"), c.var.user.id)
  if (r.changes) forgetItem("job", c.req.param("id"))
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

// ---------------------------------------------------------------- shifts (unbilled hours)

const entryBody = z.object({ date: isoDate, hours, note })

work.post("/work/jobs/:id/entries", async (c) => {
  const body = entryBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the hours." }, 400)
  const userId = c.var.user.id
  const jobId = c.req.param("id")
  if (!canEditJob(userId, jobId)) return c.json({ error: "Not found" }, 404)
  const d = body.data
  db.prepare(
    `INSERT INTO work_entry (id, job_id, date, hours, note) VALUES (?, ?, ?, ?, ?)`
  ).run(randomUUID(), jobId, d.date, round2(d.hours), clean(d.note))
  return c.json({ job: viewJob(userId, jobId) })
})

work.delete("/work/entries/:id", (c) => {
  const userId = c.var.user.id
  const row = db
    .prepare(`SELECT job_id AS jobId FROM work_entry WHERE id = ?`)
    .get(c.req.param("id")) as { jobId: string } | undefined
  if (!row || !canEditJob(userId, row.jobId))
    return c.json({ error: "Not found" }, 404)
  db.prepare(`DELETE FROM work_entry WHERE id = ?`).run(c.req.param("id"))
  return c.json({ job: viewJob(userId, row.jobId) })
})

// ---------------------------------------------------------------- bills

const invoiceBody = z.object({
  date: isoDate,
  hours,
  rate: z.number().positive().max(100_000),
  /** Defaults to hours × rate. */
  total: z.number().min(0).max(MAX_MONEY).optional(),
  counterHours: z.number().min(0).max(1_000_000).nullable().optional(),
  proofUrl,
  note,
  /** Logged shifts this bill covers; they stop counting as unbilled. */
  entryIds: z.array(z.string().max(80)).max(500).optional(),
})

work.post("/work/jobs/:id/invoices", async (c) => {
  const body = invoiceBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success)
    return c.json(
      {
        error:
          body.error.issues.find((i) => i.path[0] === "proofUrl")?.message ??
          "Check the bill details.",
      },
      400
    )
  const userId = c.var.user.id
  const jobId = c.req.param("id")
  if (!canEditJob(userId, jobId)) return c.json({ error: "Not found" }, 404)
  const d = body.data
  const id = randomUUID()
  db.exec("BEGIN")
  try {
    db.prepare(
      `INSERT INTO work_invoice (id, job_id, date, hours, rate, total, counter_hours, proof_url, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      jobId,
      d.date,
      round2(d.hours),
      d.rate,
      round2(d.total ?? d.hours * d.rate),
      d.counterHours ?? null,
      clean(d.proofUrl),
      clean(d.note)
    )
    const attach = db.prepare(
      `UPDATE work_entry SET invoice_id = ? WHERE id = ? AND job_id = ? AND invoice_id IS NULL`
    )
    for (const entryId of d.entryIds ?? []) attach.run(id, entryId, jobId)
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
  return c.json({ job: viewJob(userId, jobId) })
})

work.patch("/work/invoices/:id", async (c) => {
  const body = invoiceBody
    .omit({ entryIds: true })
    .partial()
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success)
    return c.json(
      {
        error:
          body.error.issues.find((i) => i.path[0] === "proofUrl")?.message ??
          "Check the bill details.",
      },
      400
    )
  const userId = c.var.user.id
  const jobId = invoiceJob(userId, c.req.param("id"))
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
    const v = (body.data as Record<string, unknown>)[k]
    if (v === undefined) continue
    sets.push(`${col} = ?`)
    vals.push(
      k === "note" || k === "proofUrl"
        ? clean(v as string | null)
        : typeof v === "number" && k !== "rate"
          ? round2(v)
          : (v as string | number | null)
    )
  }
  if (sets.length)
    db.prepare(`UPDATE work_invoice SET ${sets.join(", ")} WHERE id = ?`).run(
      ...vals,
      c.req.param("id")
    )
  return c.json({ job: viewJob(userId, jobId) })
})

/** Deleting a bill puts its shifts back into "unbilled" and drops its payments. */
work.delete("/work/invoices/:id", (c) => {
  const userId = c.var.user.id
  const jobId = invoiceJob(userId, c.req.param("id"))
  if (!jobId) return c.json({ error: "Not found" }, 404)
  db.prepare(`DELETE FROM work_invoice WHERE id = ?`).run(c.req.param("id"))
  return c.json({ job: viewJob(userId, jobId) })
})

// ---------------------------------------------------------------- payments

const paymentBody = z.object({
  amount: z.number().positive().max(MAX_MONEY),
  date: isoDate,
  note,
  /** The deposit in your bank this payment arrived as. */
  transactionId: z.string().max(80).nullable().optional(),
  /** What actually landed, when you were paid in one currency and it arrived converted to another. */
  receivedAmount: z.number().positive().max(MAX_MONEY).nullable().optional(),
  receivedCurrency: currencyCode.nullable().optional(),
})

work.post("/work/invoices/:id/payments", async (c) => {
  const body = paymentBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the payment details." }, 400)
  const userId = c.var.user.id
  const invoiceId = c.req.param("id")
  const jobId = invoiceJob(userId, invoiceId)
  if (!jobId) return c.json({ error: "Not found" }, 404)
  const d = body.data
  if (d.transactionId && !ownsTransaction(userId, d.transactionId))
    return c.json({ error: "Unknown transaction" }, 400)
  const received =
    d.receivedAmount && d.receivedCurrency
      ? { amount: round2(d.receivedAmount), currency: d.receivedCurrency }
      : null
  db.prepare(
    `INSERT INTO work_payment (id, invoice_id, amount, date, note, transaction_id, received_amount, received_currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    invoiceId,
    round2(d.amount),
    d.date,
    clean(d.note),
    d.transactionId ?? null,
    received?.amount ?? null,
    received?.currency ?? null
  )
  return c.json({ job: viewJob(userId, jobId) })
})

work.delete("/work/payments/:id", (c) => {
  const userId = c.var.user.id
  const row = db
    .prepare(
      `SELECT i.job_id AS jobId FROM work_payment p JOIN work_invoice i ON i.id = p.invoice_id WHERE p.id = ?`
    )
    .get(c.req.param("id")) as { jobId: string } | undefined
  if (!row || !canEditJob(userId, row.jobId))
    return c.json({ error: "Not found" }, 404)
  db.prepare(`DELETE FROM work_payment WHERE id = ?`).run(c.req.param("id"))
  return c.json({ job: viewJob(userId, row.jobId) })
})
