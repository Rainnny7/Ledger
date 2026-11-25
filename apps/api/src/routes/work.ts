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
} from "@ledger/shared/money"
import { and, asc, eq, isNull } from "drizzle-orm"
import { db } from "../db/connection.ts"
import {
	bankAccount,
	bankConnection,
	bankTransaction,
	workEntry,
	workInvoice,
	workJob,
	workPayment,
} from "../db/schema/index.ts"
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
	const jobs: WorkJobRow[] = db
		.select({
			id: workJob.id,
			name: workJob.name,
			rate: workJob.rate,
			currency: workJob.currency,
			payAmount: workJob.payAmount,
			payEveryDays: workJob.payEveryDays,
			color: workJob.color,
			notes: workJob.notes,
			archived: workJob.archived,
			createdAt: workJob.createdAt,
		})
		.from(workJob)
		.where(
			jobId
				? and(eq(workJob.userId, userId), eq(workJob.id, jobId))
				: eq(workJob.userId, userId)
		)
		.orderBy(asc(workJob.archived), asc(workJob.createdAt))
		.all() // rate, payAmount in cents
	if (jobs.length === 0) {
		return []
	}
	const invoices: WorkInvoiceRow[] = db
		.select({
			id: workInvoice.id,
			jobId: workInvoice.jobId,
			date: workInvoice.date,
			hours: workInvoice.hours,
			rate: workInvoice.rate,
			total: workInvoice.total,
			counterHours: workInvoice.counterHours,
			proofUrl: workInvoice.proofUrl,
			note: workInvoice.note,
			createdAt: workInvoice.createdAt,
		})
		.from(workInvoice)
		.innerJoin(workJob, eq(workJob.id, workInvoice.jobId))
		.where(eq(workJob.userId, userId))
		.all() // rate, total in cents
	const entries: WorkEntryRow[] = db
		.select({
			id: workEntry.id,
			jobId: workEntry.jobId,
			date: workEntry.date,
			hours: workEntry.hours,
			note: workEntry.note,
			invoiceId: workEntry.invoiceId,
			createdAt: workEntry.createdAt,
		})
		.from(workEntry)
		.innerJoin(workJob, eq(workJob.id, workEntry.jobId))
		.where(eq(workJob.userId, userId))
		.all()
	const payments: WorkPaymentRow[] = db
		.select({
			id: workPayment.id,
			invoiceId: workPayment.invoiceId,
			amount: workPayment.amount,
			date: workPayment.date,
			note: workPayment.note,
			transactionId: workPayment.transactionId,
			receivedAmount: workPayment.receivedAmount,
			receivedCurrency: workPayment.receivedCurrency,
			createdAt: workPayment.createdAt,
		})
		.from(workPayment)
		.innerJoin(workInvoice, eq(workInvoice.id, workPayment.invoiceId))
		.innerJoin(workJob, eq(workJob.id, workInvoice.jobId))
		.where(eq(workJob.userId, userId))
		.all() // amount, receivedAmount in cents
	const today = todayIso()
	return jobs.map((job) =>
		summarizeJob(
			{
				...job,
				rate: fromCents(job.rate),
				payAmount: fromCentsOrNull(job.payAmount),
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
		.select({ jobId: workInvoice.jobId })
		.from(workInvoice)
		.where(eq(workInvoice.id, invoiceId))
		.get()
	if (row && !canEditJob(userId, row.jobId)) {
		return undefined
	}
	return row?.jobId ?? null
}

const ownsTransaction = (userId: string, txId: string) =>
	db
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
		.get() !== undefined

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
		db.insert(workJob)
			.values({
				id: jobId,
				userId: user.id,
				name: payload.name,
				rate: toCents(payload.rate),
				currency: payload.currency.toUpperCase(),
				payAmount: toCentsOrNull(payload.payAmount),
				payEveryDays: payload.payEveryDays ?? null,
				color: payload.color,
				notes: clean(payload.notes),
				archived: payload.archived,
			})
			.run()
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
		const changes: Partial<typeof workJob.$inferInsert> = {}
		if (body.name !== undefined) {
			changes.name = body.name
		}
		if (body.rate !== undefined) {
			changes.rate = toCents(body.rate)
		}
		if (body.currency !== undefined) {
			changes.currency = body.currency
		}
		if (body.payAmount !== undefined) {
			changes.payAmount = toCentsOrNull(body.payAmount)
		}
		if (body.payEveryDays !== undefined) {
			changes.payEveryDays = body.payEveryDays
		}
		if (body.color !== undefined) {
			changes.color = body.color
		}
		if (body.notes !== undefined) {
			changes.notes = clean(body.notes)
		}
		if (body.archived !== undefined) {
			changes.archived = body.archived
		}
		if (Object.keys(changes).length > 0) {
			db.update(workJob)
				.set(changes)
				.where(
					and(
						eq(workJob.id, jobId),
						eq(workJob.userId, userAccess.ownerId)
					)
				)
				.run()
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
			.delete(workJob)
			.where(and(eq(workJob.id, jobId), eq(workJob.userId, user.id)))
			.returning({ id: workJob.id })
			.all()
		if (result.length > 0) {
			forgetItem("job", jobId)
		}
		return result.length > 0
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
		db.insert(workEntry)
			.values({
				id: randomUUID(),
				jobId,
				date: payload.date,
				hours: roundHours(payload.hours),
				note: clean(payload.note),
			})
			.run()
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
			.select({ jobId: workEntry.jobId })
			.from(workEntry)
			.where(eq(workEntry.id, entryId))
			.get()
		const denied = row && ownerDeleteDenied(userId, row.jobId)
		if (!row || denied === 404) {
			return status(404, { error: "Not found" })
		}
		if (denied) {
			return status(denied, { error: ONLY_OWNER })
		}
		db.delete(workEntry).where(eq(workEntry.id, entryId)).run()
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
		db.transaction((tx) => {
			tx.insert(workInvoice)
				.values({
					id: invoiceId,
					jobId,
					date: payload.date,
					hours: roundHours(payload.hours),
					rate: toCents(payload.rate),
					total:
						payload.total === undefined
							? mulCents(
									toCents(payload.rate),
									roundHours(payload.hours)
								)
							: toCents(payload.total),
					counterHours: payload.counterHours ?? null,
					proofUrl: clean(payload.proofUrl),
					note: clean(payload.note),
				})
				.run()
			for (const entryId of payload.entryIds ?? []) {
				tx.update(workEntry)
					.set({ invoiceId })
					.where(
						and(
							eq(workEntry.id, entryId),
							eq(workEntry.jobId, jobId),
							isNull(workEntry.invoiceId)
						)
					)
					.run()
			}
		})
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
		const changes: Partial<typeof workInvoice.$inferInsert> = {}
		if (body.date !== undefined) {
			changes.date = body.date
		}
		if (body.hours !== undefined) {
			changes.hours = roundHours(body.hours)
		}
		if (body.rate !== undefined) {
			changes.rate = toCents(body.rate)
		}
		if (body.total !== undefined) {
			changes.total = toCents(body.total)
		}
		if (body.counterHours !== undefined) {
			changes.counterHours =
				body.counterHours === null
					? null
					: roundHours(body.counterHours)
		}
		if (body.proofUrl !== undefined) {
			changes.proofUrl = clean(body.proofUrl)
		}
		if (body.note !== undefined) {
			changes.note = clean(body.note)
		}
		if (Object.keys(changes).length > 0) {
			db.update(workInvoice)
				.set(changes)
				.where(eq(workInvoice.id, invoiceId))
				.run()
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
		db.delete(workInvoice).where(eq(workInvoice.id, invoiceId)).run()
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
		db.insert(workPayment)
			.values({
				id: randomUUID(),
				invoiceId,
				amount: toCents(payload.amount),
				date: payload.date,
				note: clean(payload.note),
				transactionId: payload.transactionId ?? null,
				receivedAmount: received?.amount ?? null,
				receivedCurrency: received?.currency ?? null,
			})
			.run()
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
			.select({ jobId: workInvoice.jobId })
			.from(workPayment)
			.innerJoin(workInvoice, eq(workInvoice.id, workPayment.invoiceId))
			.where(eq(workPayment.id, paymentId))
			.get()
		const denied = row && ownerDeleteDenied(userId, row.jobId)
		if (!row || denied === 404) {
			return status(404, { error: "Not found" })
		}
		if (denied) {
			return status(denied, { error: ONLY_OWNER })
		}
		db.delete(workPayment).where(eq(workPayment.id, paymentId)).run()
		return { job: viewJob(userId, row.jobId) }
	},
	{ params: idParam }
)
