/** Reading and writing invoices, their payments and the user's saved payment methods. */
import { randomUUID } from "node:crypto"
import { invoiceTotals } from "@ledger/shared/invoice"
import { fromCents, toCents } from "@ledger/shared/money"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { db } from "../db/connection.ts"
import {
	invoice as invoiceTable,
	invoicePayment,
	invoiceProfile,
	paymentMethod,
	user,
	workPayment,
} from "../db/schema/index.ts"
import {
	type InvoiceItem,
	type InvoiceStatus,
	type Party,
	type PaymentMethodKind,
	type PayState,
	payState,
} from "./invoices.ts"

/** Shape of InvoicePayment as stored and returned by the API. */
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

/** Shape of InvoiceView as stored and returned by the API. */
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

/** Shape of PaymentMethod as stored and returned by the API. */
export interface PaymentMethod {
	id: string
	kind: PaymentMethodKind
	label: string
	fields: Record<string, string>
	isDefault: boolean
}

/** Shape of InvoiceProfile as stored and returned by the API. */
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

/** Default empty counterparty when none is saved on a profile. */
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

/** Serialize invoice line items for SQLite JSON columns. */
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

function paymentsFor(rows: InvoiceRow[]) {
	const out = new Map<string, InvoicePayment[]>()
	if (!rows.length) {
		return out
	}
	const own = db
		.select({
			id: invoicePayment.id,
			invoiceId: invoicePayment.invoiceId,
			amount: invoicePayment.amount,
			date: invoicePayment.date,
			method: invoicePayment.method,
			note: invoicePayment.note,
			transactionId: invoicePayment.transactionId,
			externalId: invoicePayment.externalId,
		})
		.from(invoicePayment)
		.where(
			inArray(
				invoicePayment.invoiceId,
				rows.map((row) => row.id)
			)
		)
		.orderBy(asc(invoicePayment.date), asc(invoicePayment.createdAt))
		.all()
	for (const payment of own) {
		const { invoiceId, amount, externalId, ...rest } = payment
		out.set(invoiceId, [
			...(out.get(invoiceId) ?? []),
			{
				...rest,
				amount: fromCents(amount),
				source: externalId === null ? "manual" : "paypal",
			},
		])
	}
	const linked = rows.filter((row) => row.workInvoiceId)
	if (linked.length) {
		const work = db
			.select({
				id: workPayment.id,
				billId: workPayment.invoiceId,
				amount: workPayment.amount,
				date: workPayment.date,
				note: workPayment.note,
				transactionId: workPayment.transactionId,
				externalId: workPayment.externalId,
			})
			.from(workPayment)
			.where(
				inArray(
					workPayment.invoiceId,
					linked.map((row) => row.workInvoiceId as string)
				)
			)
			.orderBy(asc(workPayment.date), asc(workPayment.createdAt))
			.all()
		for (const row of linked) {
			const list = work
				.filter((workEntry) => workEntry.billId === row.workInvoiceId)
				.map((w): InvoicePayment => ({
					id: w.id,
					amount: fromCents(w.amount),
					date: w.date,
					method: w.externalId ? "PayPal" : null,
					note: w.note,
					source: w.externalId ? "paypal" : "work",
					transactionId: w.transactionId,
				}))
			out.set(row.id, [...(out.get(row.id) ?? []), ...list])
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
	const paidCents = payments.reduce(
		(runningCents, payment) => runningCents + toCents(payment.amount),
		0
	)
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

/** Invoices with payments for the editor and PDF routes. */
export function loadInvoices(userId: string, id?: string): InvoiceView[] {
	const rows = db
		.select({
			id: invoiceTable.id,
			number: invoiceTable.number,
			token: invoiceTable.token,
			status: invoiceTable.status,
			template: invoiceTable.template,
			theme: invoiceTable.theme,
			currency: invoiceTable.currency,
			issueDate: invoiceTable.issueDate,
			dueDate: invoiceTable.dueDate,
			fromJson: invoiceTable.fromJson,
			clientJson: invoiceTable.clientJson,
			itemsJson: invoiceTable.itemsJson,
			taxRate: invoiceTable.taxRate,
			taxLabel: invoiceTable.taxLabel,
			discount: invoiceTable.discount,
			notes: invoiceTable.notes,
			terms: invoiceTable.terms,
			methodsJson: invoiceTable.methodsJson,
			workInvoiceId: invoiceTable.workInvoiceId,
			sentAt: invoiceTable.sentAt,
			viewedAt: invoiceTable.viewedAt,
			createdAt: invoiceTable.createdAt,
			updatedAt: invoiceTable.updatedAt,
		})
		.from(invoiceTable)
		.where(
			id
				? and(eq(invoiceTable.userId, userId), eq(invoiceTable.id, id))
				: eq(invoiceTable.userId, userId)
		)
		.orderBy(desc(invoiceTable.issueDate), desc(invoiceTable.createdAt))
		.all() as InvoiceRow[]
	const payments = paymentsFor(rows)
	return rows.map((row) => toView(row, payments.get(row.id) ?? []))
}

/** The invoice behind a share link, with its owner. */
export function loadByToken(token: string) {
	const row = db
		.select({ userId: invoiceTable.userId, id: invoiceTable.id })
		.from(invoiceTable)
		.where(eq(invoiceTable.token, token))
		.get()
	if (!row) {
		return null
	}
	const [invoice] = loadInvoices(row.userId, row.id)
	return invoice ? { userId: row.userId, invoice } : null
}

/** The invoice a PayPal order was created for (its `custom_id`), with its owner. */
export function loadById(id: string) {
	const row = db
		.select({ userId: invoiceTable.userId })
		.from(invoiceTable)
		.where(eq(invoiceTable.id, id))
		.get()
	if (!row) {
		return null
	}
	const [invoice] = loadInvoices(row.userId, id)
	return invoice ? { userId: row.userId, invoice } : null
}

/** Saved payment methods shown on invoices. */
export function loadPaymentMethods(userId: string): PaymentMethod[] {
	const rows = db
		.select({
			id: paymentMethod.id,
			kind: paymentMethod.kind,
			label: paymentMethod.label,
			fieldsJson: paymentMethod.fieldsJson,
			isDefault: paymentMethod.isDefault,
		})
		.from(paymentMethod)
		.where(eq(paymentMethod.userId, userId))
		.orderBy(asc(paymentMethod.createdAt))
		.all()
	return rows.map(({ fieldsJson, ...r }) => ({
		...r,
		kind: r.kind as PaymentMethodKind,
		fields: parse<Record<string, string>>(fieldsJson, {}),
	}))
}

/** Default invoice sender profile when the user has not set one. */
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

/** Sender profile and defaults for new invoices. */
export function loadProfile(userId: string): InvoiceProfile {
	const row = db
		.select({ json: invoiceProfile.json })
		.from(invoiceProfile)
		.where(eq(invoiceProfile.userId, userId))
		.get()
	const saved = parse<Partial<InvoiceProfile>>(row?.json ?? null, {})
	// Until a currency is saved here, invoices start in the account's home currency.
	const home = db
		.select({ currency: user.currency })
		.from(user)
		.where(eq(user.id, userId))
		.get()?.currency
	return {
		...DEFAULT_PROFILE,
		...(home ? { currency: home } : {}),
		...saved,
		from: { ...EMPTY_PARTY, ...saved.from },
	}
}

/** Persist invoice sender profile for a user. */
export function saveProfile(userId: string, profile: InvoiceProfile) {
	const json = JSON.stringify(profile)
	db.insert(invoiceProfile)
		.values({ userId, json })
		.onConflictDoUpdate({
			target: invoiceProfile.userId,
			set: { json },
		})
		.run()
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
		return (
			db
				.insert(workPayment)
				.values({
					id: randomUUID(),
					invoiceId: invoice.workInvoiceId,
					amount,
					date: p.date,
					note:
						[p.method, p.note].filter(Boolean).join(" · ") || null,
					transactionId: p.transactionId ?? null,
					externalId: p.externalId ?? null,
				})
				.onConflictDoNothing()
				.returning({ id: workPayment.id })
				.all().length > 0
		)
	}
	return (
		db
			.insert(invoicePayment)
			.values({
				id: randomUUID(),
				invoiceId: invoice.id,
				amount,
				date: p.date,
				method: p.method ?? null,
				note: p.note ?? null,
				transactionId: p.transactionId ?? null,
				externalId: p.externalId ?? null,
			})
			.onConflictDoNothing()
			.returning({ id: invoicePayment.id })
			.all().length > 0
	)
}
