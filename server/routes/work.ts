/** Time tracking: jobs, shifts, invoices and payments (`/api/work/*`). */
import { Elysia } from "elysia"
import { sessionUser } from "./session.ts"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
	boundedArray,
	boundedString,
	currencyCode,
	id,
	isoDate,
	jsonBody,
	money,
} from "../http/validation.ts"
import {
	fromCents,
	fromCentsOrNull,
	mulCents,
	toCents,
	toCentsOrNull,
} from "../../shared/money.ts"
import { db } from "../db/connection.ts"
import { todayIso } from "../time/today.ts"
import {
	access,
	canEdit,
	forgetItem,
	listWithShared,
	viewOne,
} from "../sharing/access.ts"
import {
	roundHours,
	summarizeJob,
	type WorkEntryRow,
	type WorkInvoiceRow,
	type WorkJobRow,
	type WorkPaymentRow,
} from "../finance/work.ts"

/** Elysia plugin wiring HTTP handlers for this area. */
export const work = new Elysia({ name: "work" }).use(sessionUser)

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
	if (jobs.length === 0) {
		return []
	}
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
	return jobs.map((job) =>
		summarizeJob(
			{
				...job,
				rate: fromCents(job.rate),
				payAmount: fromCentsOrNull(job.payAmount),
				archived: Boolean(job.archived),
			},
			invoices.map((invoice) => ({
				...invoice,
				rate: fromCents(invoice.rate),
				total: fromCents(invoice.total),
			})),
			entries,
			payments.map((payment) => ({
				...payment,
				amount: fromCents(payment.amount),
				receivedAmount: fromCentsOrNull(payment.receivedAmount),
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
	const accessResult = access(userId, "job", jobId)
	if (!accessResult) {
		return 404
	}
	return accessResult.role === "owner" ? null : 403
}

const ONLY_OWNER = "Only the owner can delete this."
const ONLY_OWNER_LINKS = "Only the owner can link a bank transaction."

/** The job an invoice belongs to, if the caller can edit it. */
function invoiceJob(userId: string, invoiceId: string) {
	const row = db
		.prepare(`SELECT job_id AS jobId FROM work_invoice WHERE id = ?`)
		.get(invoiceId) as { jobId: string } | null
	if (row && !canEditJob(userId, row.jobId)) {
		return undefined
	}
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
const clean = (value: string | null | undefined) => value?.trim() || null
/** Only plain web links: a `javascript:` URL would run when clicked. */
const proofUrl = boundedString(500)
	.trim()
	.refine((value) => {
		if (value === "") {
			return true
		}
		try {
			const parsedUrl = new URL(value)
			return (
				parsedUrl.protocol === "https:" ||
				parsedUrl.protocol === "http:"
			)
		} catch {
			return false
		}
	}, "Use a web link (https://…)")
	.nullable()
	.optional()
const hours = z.number().positive().max(10_000)

work.get("/work", ({ user }) => ({
	jobs: listWithShared(
		"job",
		user.id,
		(ownerId) => loadJobs(ownerId),
		jobFor
	),
}))

// ---------------------------------------------------------------- jobs

const jobBody = z.object({
	name: boundedString(80).trim().min(1),
	rate: money.refine(
		(rate) => rate > 0 && rate <= 100_000,
		"Rate out of range"
	),
	currency: currencyCode.default("CAD"),
	payAmount: money
		.refine(
			(amount) => amount > 0 && amount <= MAX_MONEY,
			"Amount out of range"
		)
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

work.post(
	"/work/jobs",
	async ({ user, body }) => {
		const payload = body
		const jobId = randomUUID()
		db.prepare(
			`INSERT INTO work_job (id, user_id, name, rate, currency, pay_amount, pay_every_days, color, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			jobId,
			user.id,
			payload.name,
			toCents(payload.rate),
			payload.currency.toUpperCase(),
			toCentsOrNull(payload.payAmount),
			payload.payEveryDays ?? null,
			payload.color,
			clean(payload.notes),
			payload.archived ? 1 : 0
		)
		return { job: viewJob(user.id, jobId) }
	},
	{ body: jsonBody(jobBody) }
)

work.patch(
	"/work/jobs/:id",
	async ({ user, params, body, status }) => {
		const { id: jobId } = params
		const userAccess = access(user.id, "job", jobId)
		if (!userAccess) {
			return status(404, { error: "Not found" })
		}
		if (!canEdit(userAccess)) {
			return status(403, { error: "You can only view this job." })
		}
		if (userAccess.role !== "owner") {
			delete body.archived
		}
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
			const fieldValue = (body as Record<string, unknown>)[k]
			if (fieldValue === undefined) {
				continue
			}
			sets.push(`${col} = ?`)
			vals.push(
				typeof fieldValue === "boolean"
					? fieldValue
						? 1
						: 0
					: k === "notes"
						? clean(fieldValue as string | null)
						: k === "rate" || k === "payAmount"
							? toCentsOrNull(fieldValue as number | null)
							: (fieldValue as string | number | null)
			)
		}
		if (sets.length) {
			db.prepare(
				`UPDATE work_job SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
			).run(...vals, jobId, userAccess.ownerId)
		}
		const job = viewJob(user.id, jobId)
		return job ? { job } : status(404, { error: "Not found" })
	},
	{ params: jobIdParam, body: jsonBody(patchJobBody) }
)

work.delete(
	"/work/jobs/:id",
	({ user, params, status }) => {
		const { id: jobId } = params
		const result = db
			.prepare(`DELETE FROM work_job WHERE id = ? AND user_id = ?`)
			.run(jobId, user.id)
		if (result.changes) {
			forgetItem("job", jobId)
		}
		return result.changes
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: jobIdParam }
)

// ---------------------------------------------------------------- shifts (unbilled hours)

const entryBody = z.object({ date: isoDate, hours, note })

work.post(
	"/work/jobs/:id/entries",
	async ({ user, params, body, status }) => {
		const userId = user.id
		const { id: jobId } = params
		if (!canEditJob(userId, jobId)) {
			return status(404, { error: "Not found" })
		}
		const payload = body
		db.prepare(
			`INSERT INTO work_entry (id, job_id, date, hours, note) VALUES (?, ?, ?, ?, ?)`
		).run(
			randomUUID(),
			jobId,
			payload.date,
			roundHours(payload.hours),
			clean(payload.note)
		)
		return { job: viewJob(userId, jobId) }
	},
	{ params: jobIdParam, body: jsonBody(entryBody) }
)

work.delete(
	"/work/entries/:id",
	({ user, params, status }) => {
		const userId = user.id
		const { id: entryId } = params
		const row = db
			.prepare(`SELECT job_id AS jobId FROM work_entry WHERE id = ?`)
			.get(entryId) as { jobId: string } | null
		const denied = row && ownerDeleteDenied(userId, row.jobId)
		if (!row || denied === 404) {
			return status(404, { error: "Not found" })
		}
		if (denied) {
			return status(denied, { error: ONLY_OWNER })
		}
		db.prepare(`DELETE FROM work_entry WHERE id = ?`).run(entryId)
		return { job: viewJob(userId, row.jobId) }
	},
	{ params: idParam }
)

// ---------------------------------------------------------------- bills

const invoiceBody = z.object({
	date: isoDate,
	hours,
	rate: money.refine(
		(rate) => rate > 0 && rate <= 100_000,
		"Rate out of range"
	),
	total: money
		.refine(
			(total) => total >= 0 && total <= MAX_MONEY,
			"Total out of range"
		)
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
	async ({ user, params, body, status }) => {
		const userId = user.id
		const { id: jobId } = params
		if (!canEditJob(userId, jobId)) {
			return status(404, { error: "Not found" })
		}
		const payload = body
		const invoiceId = randomUUID()
		db.exec("BEGIN")
		try {
			db.prepare(
				`INSERT INTO work_invoice (id, job_id, date, hours, rate, total, counter_hours, proof_url, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				invoiceId,
				jobId,
				payload.date,
				roundHours(payload.hours),
				toCents(payload.rate),
				payload.total === undefined
					? mulCents(toCents(payload.rate), roundHours(payload.hours))
					: toCents(payload.total),
				payload.counterHours ?? null,
				clean(payload.proofUrl),
				clean(payload.note)
			)
			const attach = db.prepare(
				`UPDATE work_entry SET invoice_id = ? WHERE id = ? AND job_id = ? AND invoice_id IS NULL`
			)
			for (const entryId of payload.entryIds ?? []) {
				attach.run(invoiceId, entryId, jobId)
			}
			db.exec("COMMIT")
		} catch (error) {
			db.exec("ROLLBACK")
			throw error
		}
		return { job: viewJob(userId, jobId) }
	},
	{ params: jobIdParam, body: jsonBody(invoiceBody) }
)

work.patch(
	"/work/invoices/:id",
	async ({ user, params, body, status }) => {
		const userId = user.id
		const { id: invoiceId } = params
		const jobId = invoiceJob(userId, invoiceId)
		if (!jobId) {
			return status(404, { error: "Not found" })
		}
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
			const fieldValue = (body as Record<string, unknown>)[k]
			if (fieldValue === undefined) {
				continue
			}
			sets.push(`${col} = ?`)
			vals.push(
				k === "note" || k === "proofUrl"
					? clean(fieldValue as string | null)
					: k === "rate" || k === "total"
						? toCents(fieldValue as number)
						: (k === "hours" || k === "counterHours") &&
							  fieldValue !== null
							? roundHours(fieldValue as number)
							: (fieldValue as string | number | null)
			)
		}
		if (sets.length) {
			db.prepare(
				`UPDATE work_invoice SET ${sets.join(", ")} WHERE id = ?`
			).run(...vals, invoiceId)
		}
		return { job: viewJob(userId, jobId) }
	},
	{ params: idParam, body: jsonBody(patchInvoiceBody) }
)

work.delete(
	"/work/invoices/:id",
	({ user, params, status }) => {
		const userId = user.id
		const { id: invoiceId } = params
		const jobId = invoiceJob(userId, invoiceId)
		if (!jobId) {
			return status(404, { error: "Not found" })
		}
		const denied = ownerDeleteDenied(userId, jobId)
		if (denied) {
			return status(denied, { error: ONLY_OWNER })
		}
		db.prepare(`DELETE FROM work_invoice WHERE id = ?`).run(invoiceId)
		return { job: viewJob(userId, jobId) }
	},
	{ params: idParam }
)

// ---------------------------------------------------------------- payments

const paymentBody = z.object({
	amount: money.refine(
		(amount) => amount > 0 && amount <= MAX_MONEY,
		"Amount out of range"
	),
	date: isoDate,
	note,
	transactionId: id.nullable().optional(),
	receivedAmount: money
		.refine(
			(amount) => amount > 0 && amount <= MAX_MONEY,
			"Amount out of range"
		)
		.nullable()
		.optional(),
	receivedCurrency: currencyCode.nullable().optional(),
})

work.post(
	"/work/invoices/:id/payments",
	async ({ user, params, body, status }) => {
		const payload = body
		const userId = user.id
		const { id: invoiceId } = params
		const jobId = invoiceJob(userId, invoiceId)
		if (!jobId) {
			return status(404, { error: "Not found" })
		}
		// Only the owner's bank can be linked: an editor's transaction would be a foreign reference.
		if (payload.transactionId) {
			if (access(userId, "job", jobId)?.role !== "owner") {
				return status(403, { error: ONLY_OWNER_LINKS })
			}
			if (!ownsTransaction(userId, payload.transactionId)) {
				return status(400, { error: "Unknown transaction" })
			}
		}
		const received =
			payload.receivedAmount && payload.receivedCurrency
				? {
						amount: toCents(payload.receivedAmount),
						currency: payload.receivedCurrency,
					}
				: null
		db.prepare(
			`INSERT INTO work_payment (id, invoice_id, amount, date, note, transaction_id, received_amount, received_currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			randomUUID(),
			invoiceId,
			toCents(payload.amount),
			payload.date,
			clean(payload.note),
			payload.transactionId ?? null,
			received?.amount ?? null,
			received?.currency ?? null
		)
		return { job: viewJob(userId, jobId) }
	},
	{ params: idParam, body: jsonBody(paymentBody) }
)

work.delete(
	"/work/payments/:id",
	({ user, params, status }) => {
		const userId = user.id
		const { id: paymentId } = params
		const row = db
			.prepare(
				`SELECT i.job_id AS jobId FROM work_payment p JOIN work_invoice i ON i.id = p.invoice_id WHERE p.id = ?`
			)
			.get(paymentId) as { jobId: string } | null
		const denied = row && ownerDeleteDenied(userId, row.jobId)
		if (!row || denied === 404) {
			return status(404, { error: "Not found" })
		}
		if (denied) {
			return status(denied, { error: ONLY_OWNER })
		}
		db.prepare(`DELETE FROM work_payment WHERE id = ?`).run(paymentId)
		return { job: viewJob(userId, row.jobId) }
	},
	{ params: idParam }
)
