import { Elysia } from "elysia"
import { sessionUser } from "../session.ts"
import { randomBytes, randomUUID } from "node:crypto"
import { z } from "zod"
import {
	boundedArray,
	boundedString,
	currencyCode,
	id,
	isoDate,
	jsonBody,
	money,
} from "../../http/validation.ts"
import { toCents } from "../../../shared/money.ts"
import { db } from "../../db/connection.ts"
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

/** Elysia plugin wiring HTTP handlers for this area. */
export const invoices = new Elysia({ name: "invoices" }).use(sessionUser)

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
		(amount) => amount >= -MAX_MONEY && amount <= MAX_MONEY,
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
		.refine(
			(amount) => amount >= 0 && amount <= MAX_MONEY,
			"Discount out of range"
		)
		.default(0),
	notes: boundedString(2000).trim().nullable().default(null),
	terms: boundedString(2000).trim().nullable().default(null),
	methodIds: boundedArray(id, 20).default([]),
	workInvoiceId: id.nullable().default(null),
})

const patchInvoiceBody = z.object(
	Object.fromEntries(
		Object.entries(invoiceBody.shape).map(([key, value]) => [
			key,
			(value as z.ZodType).optional(),
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
		.map((invoiceRow) => {
			const row = invoiceRow as {
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
		db
			.prepare(`SELECT number FROM invoice WHERE user_id = ?`)
			.all(userId) as {
			number: string
		}[]
	).map((row) => row.number)
	return nextInvoiceNumber(numbers, loadProfile(userId).prefix)
}

/** Only keep payment methods (and a Work bill) the caller owns. */
function sanitize(userId: string, d: Partial<InvoiceBody>) {
	if (d.methodIds) {
		const mine = new Set(
			loadPaymentMethods(userId).map((method) => method.id)
		)
		d.methodIds = [...new Set(d.methodIds)].filter((methodId) =>
			mine.has(methodId)
		)
	}
	if (d.workInvoiceId && !ownsBill(userId, d.workInvoiceId)) {
		d.workInvoiceId = null
	}
	if (d.currency) {
		d.currency = d.currency.toUpperCase()
	}
	return d
}

/** New invoices start from your last choices, so the next one needs fewer clicks. */
function rememberDefaults(userId: string, d: InvoiceBody) {
	const profile = loadProfile(userId)
	const prefix = /^(.*?)\d+$/.exec(d.number)?.[1]
	saveProfile(userId, {
		...profile,
		from: d.from,
		prefix: prefix ?? profile.prefix,
		template: d.template,
		theme: d.theme,
		currency: d.currency,
		taxRate: d.taxRate,
		taxLabel: d.taxLabel,
	})
}

invoices.get("/invoices", ({ user }) => {
	const userId = user.id
	return {
		invoices: loadInvoices(userId),
		methods: loadPaymentMethods(userId),
		profile: loadProfile(userId),
		nextNumber: nextNumber(userId),
		paypal: paypalConnections(userId),
	}
})

invoices.post(
	"/invoices",
	async ({ user, body }) => {
		const userId = user.id
		const sanitizedBody = sanitize(userId, body) as InvoiceBody
		const invoiceId = randomUUID()
		db.prepare(
			`INSERT INTO invoice (id, user_id, number, token, status, template, theme, currency, issue_date, due_date, from_json, client_json,
       items_json, tax_rate, tax_label, discount, notes, terms, methods_json, work_invoice_id, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${sanitizedBody.status === "sent" ? "datetime('now')" : "NULL"})`
		).run(
			invoiceId,
			userId,
			sanitizedBody.number,
			newToken(),
			sanitizedBody.status,
			sanitizedBody.template,
			sanitizedBody.theme,
			sanitizedBody.currency,
			sanitizedBody.issueDate,
			sanitizedBody.dueDate,
			JSON.stringify(sanitizedBody.from),
			JSON.stringify(sanitizedBody.client),
			itemsToJson(sanitizedBody.items),
			sanitizedBody.taxRate,
			sanitizedBody.taxLabel,
			toCents(sanitizedBody.discount),
			sanitizedBody.notes || null,
			sanitizedBody.terms || null,
			JSON.stringify(sanitizedBody.methodIds),
			sanitizedBody.workInvoiceId
		)
		rememberDefaults(userId, sanitizedBody)
		return { invoice: loadInvoices(userId, invoiceId)[0] }
	},
	{ body: jsonBody(invoiceBody) }
)

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
	async ({ user, params, body, status }) => {
		const userId = user.id
		const { id: invoiceId } = params
		const [before] = loadInvoices(userId, invoiceId)
		if (!before) {
			return status(404, { error: "Not found" })
		}
		const sanitizedBody = sanitize(userId, body as Partial<InvoiceBody>)
		const sets: string[] = []
		const vals: (string | number | null)[] = []
		for (const [k, col] of Object.entries(COLUMNS)) {
			const fieldValue = (sanitizedBody as Record<string, unknown>)[k]
			if (fieldValue === undefined) {
				continue
			}
			sets.push(`${col} = ?`)
			vals.push(
				k === "items"
					? itemsToJson(fieldValue as InvoiceBody["items"])
					: k === "discount"
						? toCents(fieldValue as number)
						: fieldValue !== null && typeof fieldValue === "object"
							? JSON.stringify(fieldValue)
							: fieldValue === "" &&
								  (k === "notes" || k === "terms")
								? null
								: (fieldValue as string | number | null)
			)
		}
		if (sanitizedBody.status === "sent" && before.status === "draft") {
			sets.push(`sent_at = COALESCE(sent_at, datetime('now'))`)
		}
		if (sets.length) {
			sets.push(`updated_at = datetime('now')`)
			db.prepare(
				`UPDATE invoice SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
			).run(...vals, invoiceId, userId)
		}
		const [invoice] = loadInvoices(userId, invoiceId)
		if (sanitizedBody.from && sanitizedBody.template) {
			rememberDefaults(userId, {
				...invoice,
				...sanitizedBody,
			} as unknown as InvoiceBody)
		}
		return { invoice }
	},
	{ params: idParam, body: jsonBody(patchInvoiceBody) }
)

invoices.delete(
	"/invoices/:id",
	({ user, params, status }) => {
		const { id: invoiceId } = params
		const result = db
			.prepare(`DELETE FROM invoice WHERE id = ? AND user_id = ?`)
			.run(invoiceId, user.id)
		return result.changes
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)

invoices.post(
	"/invoices/:id/reset-link",
	({ user, params, status }) => {
		const userId = user.id
		const { id: invoiceId } = params
		const result = db
			.prepare(
				`UPDATE invoice SET token = ?, viewed_at = NULL WHERE id = ? AND user_id = ?`
			)
			.run(newToken(), invoiceId, userId)
		return result.changes
			? { invoice: loadInvoices(userId, invoiceId)[0] }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)

const paymentBody = z.object({
	amount: money
		.refine(
			(amount) => amount >= -MAX_MONEY && amount <= MAX_MONEY,
			"Amount out of range"
		)
		.refine((amount) => amount !== 0, "Amount can’t be zero"),
	date: isoDate,
	method: boundedString(60).trim().nullable().optional(),
	note: boundedString(300).trim().nullable().optional(),
	transactionId: id.nullable().optional(),
})

invoices.post(
	"/invoices/:id/payments",
	async ({ user, params, body, status }) => {
		const userId = user.id
		const { id: invoiceId } = params
		const [invoice] = loadInvoices(userId, invoiceId)
		if (!invoice) {
			return status(404, { error: "Not found" })
		}
		const payload = body
		if (
			payload.transactionId &&
			!ownsTransaction(userId, payload.transactionId)
		) {
			return status(400, { error: "Unknown transaction" })
		}
		recordInvoicePayment(invoice, {
			...payload,
			method: payload.method || null,
			note: payload.note || null,
		})
		if (invoice.status === "draft") {
			db.prepare(
				`UPDATE invoice SET status = 'sent', sent_at = COALESCE(sent_at, datetime('now')) WHERE id = ?`
			).run(invoice.id)
		}
		return { invoice: loadInvoices(userId, invoice.id)[0] }
	},
	{ params: idParam, body: jsonBody(paymentBody) }
)

invoices.delete(
	"/invoices/:id/payments/:paymentId",
	({ user, params, status }) => {
		const userId = user.id
		const { id: invoiceId, paymentId } = params
		const [invoice] = loadInvoices(userId, invoiceId)
		const payment = invoice?.payments.find(
			(invoicePayment) => invoicePayment.id === paymentId
		)
		if (!invoice || !payment) {
			return status(404, { error: "Not found" })
		}
		if (payment.source === "manual" || !invoice.workInvoiceId) {
			db.prepare(
				`DELETE FROM invoice_payment WHERE id = ? AND invoice_id = ?`
			).run(payment.id, invoice.id)
		}
		if (invoice.workInvoiceId) {
			db.prepare(
				`DELETE FROM work_payment WHERE id = ? AND invoice_id = ?`
			).run(payment.id, invoice.workInvoiceId)
		}
		return { invoice: loadInvoices(userId, invoice.id)[0] }
	},
	{ params: invoicePaymentParam }
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

invoices.put(
	"/invoice-profile",
	({ user, body }) => {
		saveProfile(user.id, {
			...body,
			currency: body.currency.toUpperCase(),
		})
		return {
			profile: loadProfile(user.id),
			nextNumber: nextNumber(user.id),
		}
	},
	{ body: jsonBody(profileBody) }
)

const methodBody = z.object({
	kind: z.enum(PAYMENT_METHOD_KINDS),
	label: boundedString(60).trim().min(1),
	fields: z
		.record(
			boundedString(24).regex(/^[a-zA-Z]+$/),
			boundedString(500).trim()
		)
		.refine((fields) => Object.keys(fields).length <= 16),
	isDefault: z.boolean().default(false),
})

function checkMethod(userId: string, m: z.infer<typeof methodBody>) {
	if (m.kind === "paypal-checkout") {
		const ok = paypalConnections(userId).some(
			(connection) => connection.id === m.fields.connectionId
		)
		if (!ok) {
			return "Pick one of your connected PayPal accounts."
		}
	}
	if (m.kind === "link" && !/^https:\/\//i.test(m.fields.url ?? "")) {
		return "Payment links have to start with https://"
	}
	return null
}

invoices.post(
	"/payment-methods",
	async ({ user, body, status }) => {
		const userId = user.id
		const payload = body
		const problem = checkMethod(userId, payload)
		if (problem) {
			return status(400, { error: problem })
		}
		const newId = randomUUID()
		db.prepare(
			`INSERT INTO payment_method (id, user_id, kind, label, fields_json, is_default) VALUES (?, ?, ?, ?, ?, ?)`
		).run(
			newId,
			userId,
			payload.kind,
			payload.label,
			JSON.stringify(payload.fields),
			payload.isDefault ? 1 : 0
		)
		const methods = loadPaymentMethods(userId)
		const byId = new Map(methods.map((method) => [method.id, method]))
		return {
			method: byId.get(newId),
			methods,
		}
	},
	{ body: jsonBody(methodBody) }
)

invoices.put(
	"/payment-methods/:id",
	async ({ user, params, body, status }) => {
		const userId = user.id
		const payload = body
		const { id: methodId } = params
		const problem = checkMethod(userId, payload)
		if (problem) {
			return status(400, { error: problem })
		}
		const result = db
			.prepare(
				`UPDATE payment_method SET kind = ?, label = ?, fields_json = ?, is_default = ? WHERE id = ? AND user_id = ?`
			)
			.run(
				payload.kind,
				payload.label,
				JSON.stringify(payload.fields),
				payload.isDefault ? 1 : 0,
				methodId,
				userId
			)
		if (!result.changes) {
			return status(404, { error: "Not found" })
		}
		return { methods: loadPaymentMethods(userId) }
	},
	{ params: idParam, body: jsonBody(methodBody) }
)

invoices.delete(
	"/payment-methods/:id",
	({ user, params, status }) => {
		const userId = user.id
		const { id: methodId } = params
		const result = db
			.prepare(`DELETE FROM payment_method WHERE id = ? AND user_id = ?`)
			.run(methodId, userId)
		return result.changes
			? { methods: loadPaymentMethods(userId) }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)
