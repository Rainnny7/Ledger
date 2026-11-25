import { randomBytes, randomUUID } from "node:crypto"
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
} from "../../validation.ts"
import { toCents } from "../../../shared/money.ts"
import { auth } from "../../auth/index.ts"
import { db } from "../../db.ts"
import {
  itemsToJson,
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

const text = (max: number) => boundedString(max).trim().default("")
const idParam = z.object({ id: id })
const invoicePaymentParam = z.object({ id: id, paymentId: id })
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
  unitPrice: money.refine(
    (n) => n >= -MAX_MONEY && n <= MAX_MONEY,
    "Price out of range"
  ),
})
const invoiceBody = z.object({
  number: boundedString(40).trim().min(1),
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
  taxLabel: boundedString(30).trim().min(1).default("Tax"),
  discount: money
    .refine((n) => n >= 0 && n <= MAX_MONEY, "Discount out of range")
    .default(0),
  notes: boundedString(2000).trim().nullable().default(null),
  terms: boundedString(2000).trim().nullable().default(null),
  methodIds: boundedArray(id, 20).default([]),
  workInvoiceId: id.nullable().default(null),
})

const patchInvoiceBody = z.object(
  Object.fromEntries(
    Object.entries(invoiceBody.shape).map(([k, v]) => [
      k,
      (v as z.ZodType).optional(),
    ])
  )
)
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
    d.methodIds = [...new Set(d.methodIds)].filter((methodId) =>
      mine.has(methodId)
    )
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

invoices.post("/invoices", validate("json", invoiceBody), async (c) => {
  const userId = c.var.user.id
  const d = sanitize(userId, c.req.valid("json")) as InvoiceBody
  const invoiceId = randomUUID()
  db.prepare(
    `INSERT INTO invoice (id, user_id, number, token, status, template, theme, currency, issue_date, due_date, from_json, client_json,
       items_json, tax_rate, tax_label, discount, notes, terms, methods_json, work_invoice_id, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${d.status === "sent" ? "datetime('now')" : "NULL"})`
  ).run(
    invoiceId,
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
    itemsToJson(d.items),
    d.taxRate,
    d.taxLabel,
    toCents(d.discount),
    d.notes || null,
    d.terms || null,
    JSON.stringify(d.methodIds),
    d.workInvoiceId
  )
  rememberDefaults(userId, d)
  return c.json({ invoice: loadInvoices(userId, invoiceId)[0] })
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

invoices.patch(
  "/invoices/:id",
  validate("param", idParam),
  validate("json", patchInvoiceBody),
  async (c) => {
    const userId = c.var.user.id
    const { id: invoiceId } = c.req.valid("param")
    const [before] = loadInvoices(userId, invoiceId)
    if (!before) return c.json({ error: "Not found" }, 404)
    const d = sanitize(userId, c.req.valid("json") as Partial<InvoiceBody>)
    const sets: string[] = []
    const vals: (string | number | null)[] = []
    for (const [k, col] of Object.entries(COLUMNS)) {
      const v = (d as Record<string, unknown>)[k]
      if (v === undefined) continue
      sets.push(`${col} = ?`)
      vals.push(
        k === "items"
          ? itemsToJson(v as InvoiceBody["items"])
          : k === "discount"
            ? toCents(v as number)
            : v !== null && typeof v === "object"
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
      ).run(...vals, invoiceId, userId)
    }
    const [invoice] = loadInvoices(userId, invoiceId)
    if (d.from && d.template)
      rememberDefaults(userId, { ...invoice, ...d } as unknown as InvoiceBody)
    return c.json({ invoice })
  }
)

invoices.delete("/invoices/:id", validate("param", idParam), (c) => {
  const { id: invoiceId } = c.req.valid("param")
  const r = db
    .prepare(`DELETE FROM invoice WHERE id = ? AND user_id = ?`)
    .run(invoiceId, c.var.user.id)
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

invoices.post("/invoices/:id/reset-link", validate("param", idParam), (c) => {
  const userId = c.var.user.id
  const { id: invoiceId } = c.req.valid("param")
  const r = db
    .prepare(
      `UPDATE invoice SET token = ?, viewed_at = NULL WHERE id = ? AND user_id = ?`
    )
    .run(newToken(), invoiceId, userId)
  return r.changes
    ? c.json({ invoice: loadInvoices(userId, invoiceId)[0] })
    : c.json({ error: "Not found" }, 404)
})

const paymentBody = z.object({
  amount: money
    .refine((n) => n >= -MAX_MONEY && n <= MAX_MONEY, "Amount out of range")
    .refine((n) => n !== 0, "Amount can’t be zero"),
  date: isoDate,
  method: boundedString(60).trim().nullable().optional(),
  note: boundedString(300).trim().nullable().optional(),
  transactionId: id.nullable().optional(),
})

invoices.post(
  "/invoices/:id/payments",
  validate("param", idParam),
  validate("json", paymentBody),
  async (c) => {
    const userId = c.var.user.id
    const { id: invoiceId } = c.req.valid("param")
    const [invoice] = loadInvoices(userId, invoiceId)
    if (!invoice) return c.json({ error: "Not found" }, 404)
    const d = c.req.valid("json")
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
  }
)

invoices.delete(
  "/invoices/:id/payments/:paymentId",
  validate("param", invoicePaymentParam),
  (c) => {
    const userId = c.var.user.id
    const { id: invoiceId, paymentId } = c.req.valid("param")
    const [invoice] = loadInvoices(userId, invoiceId)
    const payment = invoice?.payments.find((p) => p.id === paymentId)
    if (!invoice || !payment) return c.json({ error: "Not found" }, 404)
    if (payment.source === "manual" || !invoice.workInvoiceId)
      db.prepare(
        `DELETE FROM invoice_payment WHERE id = ? AND invoice_id = ?`
      ).run(payment.id, invoice.id)
    if (invoice.workInvoiceId)
      db.prepare(
        `DELETE FROM work_payment WHERE id = ? AND invoice_id = ?`
      ).run(payment.id, invoice.workInvoiceId)
    return c.json({ invoice: loadInvoices(userId, invoice.id)[0] })
  }
)

const profileBody = z.object({
  from: party,
  prefix: boundedString(20).default("INV-"),
  template: z.enum(TEMPLATES),
  theme: z.enum(THEMES),
  currency: currencyCode,
  taxRate: z.number().min(0).max(100),
  taxLabel: boundedString(30).trim().min(1),
  dueDays: z.number().int().min(0).max(365).nullable(),
  notes: boundedString(2000),
  terms: boundedString(2000),
})

invoices.put("/invoice-profile", validate("json", profileBody), (c) => {
  const body = c.req.valid("json")
  saveProfile(c.var.user.id, {
    ...body,
    currency: body.currency.toUpperCase(),
  })
  return c.json({
    profile: loadProfile(c.var.user.id),
    nextNumber: nextNumber(c.var.user.id),
  })
})

const methodBody = z.object({
  kind: z.enum(PAYMENT_METHOD_KINDS),
  label: boundedString(60).trim().min(1),
  fields: z
    .record(boundedString(24).regex(/^[a-zA-Z]+$/), boundedString(500).trim())
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

invoices.post("/payment-methods", validate("json", methodBody), async (c) => {
  const userId = c.var.user.id
  const d = c.req.valid("json")
  const problem = checkMethod(userId, d)
  if (problem) return c.json({ error: problem }, 400)
  const newId = randomUUID()
  db.prepare(
    `INSERT INTO payment_method (id, user_id, kind, label, fields_json, is_default) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    newId,
    userId,
    d.kind,
    d.label,
    JSON.stringify(d.fields),
    d.isDefault ? 1 : 0
  )
  const methods = loadPaymentMethods(userId)
  const byId = new Map(methods.map((m) => [m.id, m]))
  return c.json({
    method: byId.get(newId),
    methods,
  })
})

invoices.put(
  "/payment-methods/:id",
  validate("param", idParam),
  validate("json", methodBody),
  async (c) => {
    const userId = c.var.user.id
    const d = c.req.valid("json")
    const { id: methodId } = c.req.valid("param")
    const problem = checkMethod(userId, d)
    if (problem) return c.json({ error: problem }, 400)
    const r = db
      .prepare(
        `UPDATE payment_method SET kind = ?, label = ?, fields_json = ?, is_default = ? WHERE id = ? AND user_id = ?`
      )
      .run(
        d.kind,
        d.label,
        JSON.stringify(d.fields),
        d.isDefault ? 1 : 0,
        methodId,
        userId
      )
    if (!r.changes) return c.json({ error: "Not found" }, 404)
    return c.json({ methods: loadPaymentMethods(userId) })
  }
)

invoices.delete("/payment-methods/:id", validate("param", idParam), (c) => {
  const userId = c.var.user.id
  const { id: methodId } = c.req.valid("param")
  const r = db
    .prepare(`DELETE FROM payment_method WHERE id = ? AND user_id = ?`)
    .run(methodId, userId)
  return r.changes
    ? c.json({ methods: loadPaymentMethods(userId) })
    : c.json({ error: "Not found" }, 404)
})
