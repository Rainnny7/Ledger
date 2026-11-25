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
import { toCents } from "@ledger/shared/money"
import { and, asc, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db/connection.ts"
import {
	bankAccount,
	bankConnection,
	bankTransaction,
	invoice as invoiceTable,
	invoicePayment as invoicePaymentTable,
	paymentMethod,
	workInvoice,
	workJob,
	workPayment,
} from "../../db/schema/index.ts"
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
		.select({ id: workInvoice.id })
		.from(workInvoice)
		.innerJoin(workJob, eq(workJob.id, workInvoice.jobId))
		.where(and(eq(workInvoice.id, billId), eq(workJob.userId, userId)))
		.get()

const ownsTransaction = (userId: string, txId: string) =>
	!!db
		.select({ id: bankTransaction.id })
		.from(bankTransaction)
		.innerJoin(bankAccount, eq(bankAccount.id, bankTransaction.accountId))
		.innerJoin(
			bankConnection,
			eq(bankConnection.id, bankAccount.connectionId)
		)
		.where(
			and(eq(bankTransaction.id, txId), eq(bankConnection.userId, userId))
		)
		.get()

function paypalConnections(userId: string) {
	return db
		.select({
			id: bankConnection.id,
			label: bankConnection.label,
			usernameMasked: bankConnection.usernameMasked,
			instantUpdates:
				sql<boolean>`${bankConnection.webhookId} IS NOT NULL`.mapWith(
					Boolean
				),
			lastEventAt: bankConnection.webhookAt,
		})
		.from(bankConnection)
		.where(
			and(
				eq(bankConnection.userId, userId),
				eq(bankConnection.institution, "paypal"),
				isNotNull(bankConnection.credentialsEnc)
			)
		)
		.orderBy(asc(bankConnection.createdAt))
		.all()
}

function nextNumber(userId: string) {
	const numbers = db
		.select({ number: invoiceTable.number })
		.from(invoiceTable)
		.where(eq(invoiceTable.userId, userId))
		.all()
		.map((row) => row.number)
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
		db.insert(invoiceTable)
			.values({
				id: invoiceId,
				userId,
				number: sanitizedBody.number,
				token: newToken(),
				status: sanitizedBody.status,
				template: sanitizedBody.template,
				theme: sanitizedBody.theme,
				currency: sanitizedBody.currency,
				issueDate: sanitizedBody.issueDate,
				dueDate: sanitizedBody.dueDate,
				fromJson: JSON.stringify(sanitizedBody.from),
				clientJson: JSON.stringify(sanitizedBody.client),
				itemsJson: itemsToJson(sanitizedBody.items),
				taxRate: sanitizedBody.taxRate,
				taxLabel: sanitizedBody.taxLabel,
				discount: toCents(sanitizedBody.discount),
				notes: sanitizedBody.notes || null,
				terms: sanitizedBody.terms || null,
				methodsJson: JSON.stringify(sanitizedBody.methodIds),
				workInvoiceId: sanitizedBody.workInvoiceId,
				sentAt:
					sanitizedBody.status === "sent"
						? sql`datetime('now')`
						: null,
			})
			.run()
		rememberDefaults(userId, sanitizedBody)
		return { invoice: loadInvoices(userId, invoiceId)[0] }
	},
	{ body: jsonBody(invoiceBody) }
)

/** Request body field to the invoice column it is stored in. */
const COLUMNS = {
	number: "number",
	status: "status",
	template: "template",
	theme: "theme",
	currency: "currency",
	issueDate: "issueDate",
	dueDate: "dueDate",
	from: "fromJson",
	client: "clientJson",
	items: "itemsJson",
	taxRate: "taxRate",
	taxLabel: "taxLabel",
	discount: "discount",
	notes: "notes",
	terms: "terms",
	methodIds: "methodsJson",
	workInvoiceId: "workInvoiceId",
} as const satisfies Record<string, keyof typeof invoiceTable.$inferInsert>

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
		const changes: Record<string, unknown> = {}
		for (const [field, column] of Object.entries(COLUMNS)) {
			const fieldValue = (sanitizedBody as Record<string, unknown>)[field]
			if (fieldValue === undefined) {
				continue
			}
			changes[column] =
				field === "items"
					? itemsToJson(fieldValue as InvoiceBody["items"])
					: field === "discount"
						? toCents(fieldValue as number)
						: fieldValue !== null && typeof fieldValue === "object"
							? JSON.stringify(fieldValue)
							: fieldValue === "" &&
								  (field === "notes" || field === "terms")
								? null
								: fieldValue
		}
		if (sanitizedBody.status === "sent" && before.status === "draft") {
			changes.sentAt = sql`COALESCE(${invoiceTable.sentAt}, datetime('now'))`
		}
		if (Object.keys(changes).length) {
			changes.updatedAt = sql`datetime('now')`
			db.update(invoiceTable)
				.set(changes)
				.where(
					and(
						eq(invoiceTable.id, invoiceId),
						eq(invoiceTable.userId, userId)
					)
				)
				.run()
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
			.delete(invoiceTable)
			.where(
				and(
					eq(invoiceTable.id, invoiceId),
					eq(invoiceTable.userId, user.id)
				)
			)
			.returning({ id: invoiceTable.id })
			.all()
		return result.length
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
			.update(invoiceTable)
			.set({ token: newToken(), viewedAt: null })
			.where(
				and(
					eq(invoiceTable.id, invoiceId),
					eq(invoiceTable.userId, userId)
				)
			)
			.returning({ id: invoiceTable.id })
			.all()
		return result.length
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
			db.update(invoiceTable)
				.set({
					status: "sent",
					sentAt: sql`COALESCE(${invoiceTable.sentAt}, datetime('now'))`,
				})
				.where(eq(invoiceTable.id, invoice.id))
				.run()
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
			db.delete(invoicePaymentTable)
				.where(
					and(
						eq(invoicePaymentTable.id, payment.id),
						eq(invoicePaymentTable.invoiceId, invoice.id)
					)
				)
				.run()
		}
		if (invoice.workInvoiceId) {
			db.delete(workPayment)
				.where(
					and(
						eq(workPayment.id, payment.id),
						eq(workPayment.invoiceId, invoice.workInvoiceId)
					)
				)
				.run()
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
		db.insert(paymentMethod)
			.values({
				id: newId,
				userId,
				kind: payload.kind,
				label: payload.label,
				fieldsJson: JSON.stringify(payload.fields),
				isDefault: Boolean(payload.isDefault),
			})
			.run()
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
			.update(paymentMethod)
			.set({
				kind: payload.kind,
				label: payload.label,
				fieldsJson: JSON.stringify(payload.fields),
				isDefault: Boolean(payload.isDefault),
			})
			.where(
				and(
					eq(paymentMethod.id, methodId),
					eq(paymentMethod.userId, userId)
				)
			)
			.returning({ id: paymentMethod.id })
			.all()
		if (!result.length) {
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
			.delete(paymentMethod)
			.where(
				and(
					eq(paymentMethod.id, methodId),
					eq(paymentMethod.userId, userId)
				)
			)
			.returning({ id: paymentMethod.id })
			.all()
		return result.length
			? { methods: loadPaymentMethods(userId) }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)
