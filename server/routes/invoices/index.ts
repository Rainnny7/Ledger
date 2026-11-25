import { randomBytes, randomUUID } from "node:crypto"
import { Hono } from "hono"
import { z } from "zod"
import { currencyCode, isoDate } from "../../validation.ts"
import { auth } from "../../auth/index.ts"
import { db } from "../../db.ts"
import {
  loadInvoices,
  loadPaymentMethods,
  loadProfile,
  recordInvoicePayment,
  saveProfile,
} from "../../finance/invoice-store.ts"
import {
  nextInvoiceNumber,
  PAYMENT_METHOD_KINDS,
} from "../../finance/invoices.ts"

type Vars = { Variables: { user: typeof auth.$Infer.Session.user } }
export const invoices = new Hono<Vars>()

const MAX_MONEY = 100_000_000
const TEMPLATES = ["modern", "minimal", "classic"] as const
const THEMES = [
  "professional",
  "modern",
  "elegant",
  "corporate",
  "forest",
  "vivid",
] as const

const text = (max: number) => z.string().trim().max(max).default("")
const party = z.object({
  name: text(120),
  email: text(200),
  phone: text(50),
  address: text(400),
  taxId: text(60),
})
const item = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().min(0).max(1_000_000),
  unitPrice: z.number().min(-MAX_MONEY).max(MAX_MONEY),
})
const invoiceBody = z.object({
  number: z.string().trim().min(1).max(40),
  status: z.enum(["draft", "sent", "void"]).default("draft"),
  template: z.enum(TEMPLATES).default("modern"),
  theme: z.enum(THEMES).default("professional"),
  currency: currencyCode.default("CAD"),
  issueDate: isoDate,
  dueDate: isoDate.nullable().default(null),
  from: party,
  client: party,
  items: z.array(item).min(1).max(100),
  taxRate: z.number().min(0).max(100).default(0),
  taxLabel: z.string().trim().min(1).max(30).default("Tax"),
  discount: z.number().min(0).max(MAX_MONEY).default(0),
  notes: z.string().trim().max(2000).nullable().default(null),
  terms: z.string().trim().max(2000).nullable().default(null),
  methodIds: z.array(z.string().max(80)).max(20).default([]),
  workInvoiceId: z.string().max(80).nullable().default(null),
})
type InvoiceBody = z.infer<typeof invoiceBody>

const newToken = () => randomBytes(18).toString("base64url")

const ownsBill = (userId: string, billId: string) =>
  !!db
    .prepare(
      `SELECT 1 FROM work_invoice i JOIN work_job j ON j.id = i.job_id WHERE i.id = ? AND j.user_id = ?`
    )
    .get(billId, userId)

const ownsTransaction = (userId: string, txId: string) =>
  !!db
    .prepare(
      `SELECT 1 FROM bank_transaction t JOIN bank_account a ON a.id = t.account_id JOIN bank_connection c ON c.id = a.connection_id
        WHERE t.id = ? AND c.user_id = ?`
    )
    .get(txId, userId)

function paypalConnections(userId: string) {
  return db
    .prepare(
      `SELECT id, label, username_masked AS usernameMasked, webhook_id IS NOT NULL AS instantUpdates, webhook_at AS lastEventAt
         FROM bank_connection WHERE user_id = ? AND institution = 'paypal' AND credentials_enc IS NOT NULL ORDER BY created_at`
    )
    .all(userId)
    .map((r) => {
      const row = r as {
        id: string
        label: string
        usernameMasked: string
        instantUpdates: number
        lastEventAt: string | null
      }
      return { ...row, instantUpdates: Boolean(row.instantUpdates) }
    })
}

function nextNumber(userId: string) {
  const numbers = (
    db.prepare(`SELECT number FROM invoice WHERE user_id = ?`).all(userId) as {
      number: string
    }[]
  ).map((r) => r.number)
  return nextInvoiceNumber(numbers, loadProfile(userId).prefix)
}

/** Only keep payment methods (and a Work bill) the caller owns. */
function sanitize(userId: string, d: Partial<InvoiceBody>) {
  if (d.methodIds) {
    const mine = new Set(loadPaymentMethods(userId).map((m) => m.id))
    d.methodIds = [...new Set(d.methodIds)].filter((id) => mine.has(id))
  }
  if (d.workInvoiceId && !ownsBill(userId, d.workInvoiceId))
    d.workInvoiceId = null
  if (d.currency) d.currency = d.currency.toUpperCase()
  return d
}

/** New invoices start from your last choices, so the next one needs fewer clicks. */
function rememberDefaults(userId: string, d: InvoiceBody) {
  const p = loadProfile(userId)
  const prefix = /^(.*?)\d+$/.exec(d.number)?.[1]
  saveProfile(userId, {
    ...p,
    from: d.from,
    prefix: prefix ?? p.prefix,
    template: d.template,
    theme: d.theme,
    currency: d.currency,
    taxRate: d.taxRate,
    taxLabel: d.taxLabel,
  })
}

invoices.get("/invoices", (c) => {
  const userId = c.var.user.id
  return c.json({
    invoices: loadInvoices(userId),
    methods: loadPaymentMethods(userId),
    profile: loadProfile(userId),
    nextNumber: nextNumber(userId),
    paypal: paypalConnections(userId),
  })
})

invoices.post("/invoices", async (c) => {
  const body = invoiceBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: describe(body.error) }, 400)
  const userId = c.var.user.id
  const d = sanitize(userId, body.data) as InvoiceBody
  const id = randomUUID()
  db.prepare(
    `INSERT INTO invoice (id, user_id, number, token, status, template, theme, currency, issue_date, due_date, from_json, client_json,
       items_json, tax_rate, tax_label, discount, notes, terms, methods_json, work_invoice_id, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${d.status === "sent" ? "datetime('now')" : "NULL"})`
  ).run(
    id,
    userId,
    d.number,
    newToken(),
    d.status,
    d.template,
    d.theme,
    d.currency,
    d.issueDate,
    d.dueDate,
    JSON.stringify(d.from),
    JSON.stringify(d.client),
    JSON.stringify(d.items),
    d.taxRate,
    d.taxLabel,
    d.discount,
    d.notes || null,
    d.terms || null,
    JSON.stringify(d.methodIds),
    d.workInvoiceId
  )
  rememberDefaults(userId, d)
  return c.json({ invoice: loadInvoices(userId, id)[0] })
})

const COLUMNS: Record<string, string> = {
  number: "number",
  status: "status",
  template: "template",
  theme: "theme",
  currency: "currency",
  issueDate: "issue_date",
  dueDate: "due_date",
  from: "from_json",
  client: "client_json",
  items: "items_json",
  taxRate: "tax_rate",
  taxLabel: "tax_label",
  discount: "discount",
  notes: "notes",
  terms: "terms",
  methodIds: "methods_json",
  workInvoiceId: "work_invoice_id",
}

invoices.patch("/invoices/:id", async (c) => {
  // No defaults on an update: only what was sent changes.
  const partial = z.object(
    Object.fromEntries(
      Object.entries(invoiceBody.shape).map(([k, v]) => [
        k,
        (v as z.ZodType).optional(),
      ])
    )
  )
  const body = partial.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: describe(body.error) }, 400)
  const userId = c.var.user.id
  const id = c.req.param("id")
  const [before] = loadInvoices(userId, id)
  if (!before) return c.json({ error: "Not found" }, 404)
  const d = sanitize(userId, body.data as Partial<InvoiceBody>)
  const sets: string[] = []
  const vals: (string | number | null)[] = []
  for (const [k, col] of Object.entries(COLUMNS)) {
    const v = (d as Record<string, unknown>)[k]
    if (v === undefined) continue
    sets.push(`${col} = ?`)
    vals.push(
      v !== null && typeof v === "object"
        ? JSON.stringify(v)
        : v === "" && (k === "notes" || k === "terms")
          ? null
          : (v as string | number | null)
    )
  }
  if (d.status === "sent" && before.status === "draft")
    sets.push(`sent_at = COALESCE(sent_at, datetime('now'))`)
  if (sets.length) {
    sets.push(`updated_at = datetime('now')`)
    db.prepare(
      `UPDATE invoice SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
    ).run(...vals, id, userId)
  }
  const [invoice] = loadInvoices(userId, id)
  if (d.from && d.template)
    rememberDefaults(userId, { ...invoice, ...d } as unknown as InvoiceBody)
  return c.json({ invoice })
})

invoices.delete("/invoices/:id", (c) => {
  const r = db
    .prepare(`DELETE FROM invoice WHERE id = ? AND user_id = ?`)
    .run(c.req.param("id"), c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

/** A new share link; the old one stops working. */
invoices.post("/invoices/:id/reset-link", (c) => {
  const userId = c.var.user.id
  const r = db
    .prepare(
      `UPDATE invoice SET token = ?, viewed_at = NULL WHERE id = ? AND user_id = ?`
    )
    .run(newToken(), c.req.param("id"), userId)
  return r.changes
    ? c.json({ invoice: loadInvoices(userId, c.req.param("id"))[0] })
    : c.json({ error: "Not found" }, 404)
})

const paymentBody = z.object({
  /** Negative for a refund. */
  amount: z
    .number()
    .min(-MAX_MONEY)
    .max(MAX_MONEY)
    .refine((n) => n !== 0),
  date: isoDate,
  method: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  transactionId: z.string().max(80).nullable().optional(),
})

invoices.post("/invoices/:id/payments", async (c) => {
  const body = paymentBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the payment details." }, 400)
  const userId = c.var.user.id
  const [invoice] = loadInvoices(userId, c.req.param("id"))
  if (!invoice) return c.json({ error: "Not found" }, 404)
  const d = body.data
  if (d.transactionId && !ownsTransaction(userId, d.transactionId))
    return c.json({ error: "Unknown transaction" }, 400)
  recordInvoicePayment(invoice, {
    ...d,
    method: d.method || null,
    note: d.note || null,
  })
  if (invoice.status === "draft")
    db.prepare(
      `UPDATE invoice SET status = 'sent', sent_at = COALESCE(sent_at, datetime('now')) WHERE id = ?`
    ).run(invoice.id)
  return c.json({ invoice: loadInvoices(userId, invoice.id)[0] })
})

invoices.delete("/invoices/:id/payments/:paymentId", (c) => {
  const userId = c.var.user.id
  const [invoice] = loadInvoices(userId, c.req.param("id"))
  const payment = invoice?.payments.find(
    (p) => p.id === c.req.param("paymentId")
  )
  if (!invoice || !payment) return c.json({ error: "Not found" }, 404)
  if (payment.source === "manual" || !invoice.workInvoiceId)
    db.prepare(
      `DELETE FROM invoice_payment WHERE id = ? AND invoice_id = ?`
    ).run(payment.id, invoice.id)
  if (invoice.workInvoiceId)
    db.prepare(`DELETE FROM work_payment WHERE id = ? AND invoice_id = ?`).run(
      payment.id,
      invoice.workInvoiceId
    )
  return c.json({ invoice: loadInvoices(userId, invoice.id)[0] })
})

// ---------------------------------------------------------------- your details & payment methods

const profileBody = z.object({
  from: party,
  prefix: z.string().max(20).default("INV-"),
  template: z.enum(TEMPLATES),
  theme: z.enum(THEMES),
  currency: currencyCode,
  taxRate: z.number().min(0).max(100),
  taxLabel: z.string().trim().min(1).max(30),
  dueDays: z.number().int().min(0).max(365).nullable(),
  notes: z.string().max(2000),
  terms: z.string().max(2000),
})

invoices.put("/invoice-profile", async (c) => {
  const body = profileBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check your details." }, 400)
  saveProfile(c.var.user.id, {
    ...body.data,
    currency: body.data.currency.toUpperCase(),
  })
  return c.json({
    profile: loadProfile(c.var.user.id),
    nextNumber: nextNumber(c.var.user.id),
  })
})

const methodBody = z.object({
  kind: z.enum(PAYMENT_METHOD_KINDS),
  label: z.string().trim().min(1).max(60),
  fields: z
    .record(z.string().regex(/^[a-zA-Z]{1,24}$/), z.string().trim().max(500))
    .refine((f) => Object.keys(f).length <= 16),
  isDefault: z.boolean().default(false),
})

function checkMethod(userId: string, m: z.infer<typeof methodBody>) {
  if (m.kind === "paypal-checkout") {
    const ok = paypalConnections(userId).some(
      (p) => p.id === m.fields.connectionId
    )
    if (!ok) return "Pick one of your connected PayPal accounts."
  }
  if (m.kind === "link" && !/^https:\/\//i.test(m.fields.url ?? ""))
    return "Payment links have to start with https://"
  return null
}

invoices.post("/payment-methods", async (c) => {
  const body = methodBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the payment method." }, 400)
  const userId = c.var.user.id
  const problem = checkMethod(userId, body.data)
  if (problem) return c.json({ error: problem }, 400)
  const id = randomUUID()
  const d = body.data
  db.prepare(
    `INSERT INTO payment_method (id, user_id, kind, label, fields_json, is_default) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    d.kind,
    d.label,
    JSON.stringify(d.fields),
    d.isDefault ? 1 : 0
  )
  const methods = loadPaymentMethods(userId)
  const byId = new Map(methods.map((m) => [m.id, m]))
  return c.json({
    method: byId.get(id),
    methods,
  })
})

invoices.put("/payment-methods/:id", async (c) => {
  const body = methodBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the payment method." }, 400)
  const userId = c.var.user.id
  const problem = checkMethod(userId, body.data)
  if (problem) return c.json({ error: problem }, 400)
  const d = body.data
  const r = db
    .prepare(
      `UPDATE payment_method SET kind = ?, label = ?, fields_json = ?, is_default = ? WHERE id = ? AND user_id = ?`
    )
    .run(
      d.kind,
      d.label,
      JSON.stringify(d.fields),
      d.isDefault ? 1 : 0,
      c.req.param("id"),
      userId
    )
  if (!r.changes) return c.json({ error: "Not found" }, 404)
  return c.json({ methods: loadPaymentMethods(userId) })
})

invoices.delete("/payment-methods/:id", (c) => {
  const userId = c.var.user.id
  const r = db
    .prepare(`DELETE FROM payment_method WHERE id = ? AND user_id = ?`)
    .run(c.req.param("id"), userId)
  return r.changes
    ? c.json({ methods: loadPaymentMethods(userId) })
    : c.json({ error: "Not found" }, 404)
})

function describe(error: z.ZodError) {
  const issue = error.issues[0]
  const path = issue?.path.join(".") ?? ""
  if (path.startsWith("items"))
    return issue?.code === "too_small" && path === "items"
      ? "Add at least one line item."
      : "Every line item needs a description."
  if (path === "number") return "Give the invoice a number."
  return "Check the invoice details."
}
