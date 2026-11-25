/** Reading and writing invoices, their payments and the user's saved payment methods. */
import { randomUUID } from "node:crypto"
import { invoiceTotals } from "../../shared/invoice.ts"
import { fromCents, toCents } from "../../shared/money.ts"
import { db } from "../db.ts"
import {
  type InvoiceItem,
  type InvoiceStatus,
  type Party,
  type PaymentMethodKind,
  type PayState,
  payState,
} from "./invoices.ts"

export interface InvoicePayment {
  id: string
  amount: number
  date: string
  method: string | null
  note: string | null
  /** `work`: recorded on the linked Work bill. `paypal`: paid through the invoice's PayPal checkout. */
  source: "manual" | "work" | "paypal"
  transactionId: string | null
}

export interface InvoiceView {
  id: string
  number: string
  token: string
  status: InvoiceStatus
  template: string
  theme: string
  currency: string
  issueDate: string
  dueDate: string | null
  from: Party
  client: Party
  items: InvoiceItem[]
  taxRate: number
  taxLabel: string
  discount: number
  notes: string | null
  terms: string | null
  methodIds: string[]
  workInvoiceId: string | null
  sentAt: string | null
  viewedAt: string | null
  createdAt: string
  updatedAt: string
  subtotal: number
  tax: number
  total: number
  paid: number
  balance: number
  payState: PayState
  payments: InvoicePayment[]
}

export interface PaymentMethod {
  id: string
  kind: PaymentMethodKind
  label: string
  fields: Record<string, string>
  isDefault: boolean
}

export interface InvoiceProfile {
  from: Party
  prefix: string
  template: string
  theme: string
  currency: string
  taxRate: number
  taxLabel: string
  /** Days until due for new invoices; 0 = due on receipt, null = no due date. */
  dueDays: number | null
  notes: string
  terms: string
}

export const EMPTY_PARTY: Party = {
  name: "",
  email: "",
  phone: "",
  address: "",
  taxId: "",
}

const parse = <T>(s: string | null, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}

interface InvoiceRow {
  id: string
  number: string
  token: string
  status: InvoiceStatus
  template: string
  theme: string
  currency: string
  issueDate: string
  dueDate: string | null
  fromJson: string
  clientJson: string
  itemsJson: string
  taxRate: number
  taxLabel: string
  discount: number
  notes: string | null
  terms: string | null
  methodsJson: string
  workInvoiceId: string | null
  sentAt: string | null
  viewedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Line items are stored with `unitPriceCents`; the API and `invoiceTotals` use decimal `unitPrice`. */
interface StoredItem extends Omit<InvoiceItem, "unitPrice"> {
  unitPriceCents: number
}

export const itemsToJson = (items: InvoiceItem[]) =>
  JSON.stringify(
    items.map(({ unitPrice, ...item }): StoredItem => ({
      ...item,
      unitPriceCents: toCents(unitPrice),
    }))
  )

const itemsFromJson = (s: string): InvoiceItem[] =>
  parse<StoredItem[]>(s, []).map(({ unitPriceCents, ...item }) => ({
    ...item,
    unitPrice: fromCents(unitPriceCents),
  }))

const SELECT = `SELECT id, number, token, status, template, theme, currency, issue_date AS issueDate, due_date AS dueDate,
  from_json AS fromJson, client_json AS clientJson, items_json AS itemsJson, tax_rate AS taxRate, tax_label AS taxLabel,
  discount, notes, terms, methods_json AS methodsJson, work_invoice_id AS workInvoiceId, sent_at AS sentAt,
  viewed_at AS viewedAt, created_at AS createdAt, updated_at AS updatedAt FROM invoice`

function paymentsFor(rows: InvoiceRow[]) {
  const out = new Map<string, InvoicePayment[]>()
  if (!rows.length) return out
  const own = db
    .prepare(
      `SELECT id, invoice_id AS invoiceId, amount, date, method, note, transaction_id AS transactionId,
              CASE WHEN external_id IS NULL THEN 'manual' ELSE 'paypal' END AS source
         FROM invoice_payment WHERE invoice_id IN (${rows.map(() => "?").join(",")}) ORDER BY date, created_at`
    )
    .all(...rows.map((r) => r.id)) as unknown as (InvoicePayment & {
    invoiceId: string
  })[]
  for (const p of own) {
    const { invoiceId, amount, ...rest } = p
    out.set(invoiceId, [
      ...(out.get(invoiceId) ?? []),
      { ...rest, amount: fromCents(amount) },
    ])
  }
  const linked = rows.filter((r) => r.workInvoiceId)
  if (linked.length) {
    const work = db
      .prepare(
        `SELECT id, invoice_id AS billId, amount, date, note, transaction_id AS transactionId, external_id AS externalId
           FROM work_payment WHERE invoice_id IN (${linked.map(() => "?").join(",")}) ORDER BY date, created_at`
      )
      .all(...linked.map((r) => r.workInvoiceId)) as unknown as {
      id: string
      billId: string
      amount: number
      date: string
      note: string | null
      transactionId: string | null
      externalId: string | null
    }[]
    for (const r of linked) {
      const list = work
        .filter((w) => w.billId === r.workInvoiceId)
        .map((w): InvoicePayment => ({
          id: w.id,
          amount: fromCents(w.amount),
          date: w.date,
          method: w.externalId ? "PayPal" : null,
          note: w.note,
          source: w.externalId ? "paypal" : "work",
          transactionId: w.transactionId,
        }))
      out.set(r.id, [...(out.get(r.id) ?? []), ...list])
    }
  }
  return out
}

function toView(r: InvoiceRow, payments: InvoicePayment[]): InvoiceView {
  const items = itemsFromJson(r.itemsJson)
  const totals = invoiceTotals({
    items,
    taxRate: r.taxRate,
    discount: fromCents(r.discount),
  })
  const paidCents = payments.reduce((s, p) => s + toCents(p.amount), 0)
  const paid = fromCents(paidCents)
  const { fromJson, clientJson, itemsJson: _i, methodsJson, ...rest } = r
  return {
    ...rest,
    from: { ...EMPTY_PARTY, ...parse<Partial<Party>>(fromJson, {}) },
    client: { ...EMPTY_PARTY, ...parse<Partial<Party>>(clientJson, {}) },
    items,
    methodIds: parse<string[]>(methodsJson, []),
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total,
    paid,
    balance: fromCents(Math.max(0, toCents(totals.total) - paidCents)),
    payState: payState(totals.total, paid),
    payments,
  }
}

export function loadInvoices(userId: string, id?: string): InvoiceView[] {
  const rows = db
    .prepare(
      `${SELECT} WHERE user_id = ?${id ? " AND id = ?" : ""} ORDER BY issue_date DESC, created_at DESC`
    )
    .all(...(id ? [userId, id] : [userId])) as unknown as InvoiceRow[]
  const payments = paymentsFor(rows)
  return rows.map((r) => toView(r, payments.get(r.id) ?? []))
}

/** The invoice behind a share link, with its owner. */
export function loadByToken(token: string) {
  const row = db
    .prepare(`SELECT user_id AS userId, id FROM invoice WHERE token = ?`)
    .get(token) as { userId: string; id: string } | undefined
  if (!row) return null
  const [invoice] = loadInvoices(row.userId, row.id)
  return invoice ? { userId: row.userId, invoice } : null
}

/** The invoice a PayPal order was created for (its `custom_id`), with its owner. */
export function loadById(id: string) {
  const row = db
    .prepare(`SELECT user_id AS userId FROM invoice WHERE id = ?`)
    .get(id) as { userId: string } | undefined
  if (!row) return null
  const [invoice] = loadInvoices(row.userId, id)
  return invoice ? { userId: row.userId, invoice } : null
}

export function loadPaymentMethods(userId: string): PaymentMethod[] {
  const rows = db
    .prepare(
      `SELECT id, kind, label, fields_json AS fieldsJson, is_default AS isDefault FROM payment_method WHERE user_id = ? ORDER BY created_at`
    )
    .all(userId) as unknown as {
    id: string
    kind: PaymentMethodKind
    label: string
    fieldsJson: string
    isDefault: number
  }[]
  return rows.map(({ fieldsJson, ...r }) => ({
    ...r,
    isDefault: Boolean(r.isDefault),
    fields: parse<Record<string, string>>(fieldsJson, {}),
  }))
}

export const DEFAULT_PROFILE: InvoiceProfile = {
  from: EMPTY_PARTY,
  prefix: "INV-",
  template: "modern",
  theme: "professional",
  currency: "CAD",
  taxRate: 0,
  taxLabel: "Tax",
  dueDays: 14,
  notes: "Thank you for your business!",
  terms: "",
}

export function loadProfile(userId: string): InvoiceProfile {
  const row = db
    .prepare(`SELECT json FROM invoice_profile WHERE user_id = ?`)
    .get(userId) as { json: string } | undefined
  const saved = parse<Partial<InvoiceProfile>>(row?.json ?? null, {})
  // Until a currency is saved here, invoices start in the account's home currency.
  const home = (
    db.prepare(`SELECT currency FROM user WHERE id = ?`).get(userId) as
      | { currency?: string | null }
      | undefined
  )?.currency
  return {
    ...DEFAULT_PROFILE,
    ...(home ? { currency: home } : {}),
    ...saved,
    from: { ...EMPTY_PARTY, ...saved.from },
  }
}

export function saveProfile(userId: string, profile: InvoiceProfile) {
  db.prepare(
    `INSERT INTO invoice_profile (user_id, json) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET json = excluded.json`
  ).run(userId, JSON.stringify(profile))
}

/**
 * Records money received against an invoice. Linked to a Work bill, it goes on the bill (so the
 * Work page agrees). `externalId` (a PayPal capture id) makes a repeat of the same payment a no-op.
 * Returns false when it was already recorded.
 */
export function recordInvoicePayment(
  invoice: Pick<InvoiceView, "id" | "workInvoiceId">,
  p: {
    amount: number
    date: string
    method?: string | null
    note?: string | null
    transactionId?: string | null
    externalId?: string | null
  }
) {
  const amount = toCents(p.amount)
  if (invoice.workInvoiceId) {
    const r = db
      .prepare(
        `INSERT INTO work_payment (id, invoice_id, amount, date, note, transaction_id, external_id) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`
      )
      .run(
        randomUUID(),
        invoice.workInvoiceId,
        amount,
        p.date,
        [p.method, p.note].filter(Boolean).join(" · ") || null,
        p.transactionId ?? null,
        p.externalId ?? null
      )
    return Number(r.changes) > 0
  }
  const r = db
    .prepare(
      `INSERT INTO invoice_payment (id, invoice_id, amount, date, method, note, transaction_id, external_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`
    )
    .run(
      randomUUID(),
      invoice.id,
      amount,
      p.date,
      p.method ?? null,
      p.note ?? null,
      p.transactionId ?? null,
      p.externalId ?? null
    )
  return Number(r.changes) > 0
}
