/**
 * Hourly side work that gets paid in instalments: log hours, bill them ("done 40 hours since last
 * pay, total is $1,000"), then record each partial payment until the bill is cleared.
 */
import { fromCents, mulMoney, roundTo, toCents } from "@ledger/shared/money"

/** Shape of WorkJobRow as stored and returned by the API. */
export interface WorkJobRow {
	id: string
	name: string
	rate: number
	currency: string
	/** The usual instalment, e.g. $250 a week. */
	payAmount: number | null
	/** How often instalments arrive, in days (7 = weekly). */
	payEveryDays: number | null
	color: string
	notes: string | null
	archived: boolean
	createdAt: string
}

/** Shape of WorkInvoiceRow as stored and returned by the API. */
export interface WorkInvoiceRow {
	id: string
	jobId: string
	date: string
	hours: number
	rate: number
	total: number
	/** The time tracker's running total when this was billed. */
	counterHours: number | null
	proofUrl: string | null
	note: string | null
	createdAt: string
}

/** Shape of WorkEntryRow as stored and returned by the API. */
export interface WorkEntryRow {
	id: string
	jobId: string
	date: string
	hours: number
	note: string | null
	invoiceId: string | null
	createdAt: string
}

/** Shape of WorkPaymentRow as stored and returned by the API. */
export interface WorkPaymentRow {
	id: string
	invoiceId: string
	amount: number
	date: string
	note: string | null
	transactionId: string | null
	/** Set when the money arrived converted: the amount and currency that landed. */
	receivedAmount?: number | null
	receivedCurrency?: string | null
	createdAt: string
}

/** InvoiceStatus values accepted by validation and routes. */
export type InvoiceStatus = "unpaid" | "partial" | "paid"

/** Hours are tracked to the hundredth. */
export const roundHours = (hours: number) => roundTo(hours, 2)

const sumCents = <T>(list: T[], pick: (item: T) => number) =>
	list.reduce((runningCents, item) => runningCents + toCents(pick(item)), 0)

/** Add calendar days to an ISO date string. */
export function addDays(iso: string, days: number) {
	const [y, m, d] = iso.split("-").map(Number)
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const byDate = <T extends { date: string; createdAt: string }>(
	left: T,
	right: T
) =>
	left.date.localeCompare(right.date) ||
	left.createdAt.localeCompare(right.createdAt)

/** Paid/unpaid breakdown and payment history for a work invoice. */
export function summarizeInvoice(
	invoice: WorkInvoiceRow,
	payments: WorkPaymentRow[]
) {
	const sorted = payments
		.filter((payment) => payment.invoiceId === invoice.id)
		.toSorted(byDate)
	const total = toCents(invoice.total)
	let left = total
	const withRunning = sorted.map((payment) => {
		left -= toCents(payment.amount)
		return { ...payment, remainingAfter: fromCents(Math.max(0, left)) }
	})
	const paid = sumCents(sorted, (payment) => payment.amount)
	const remaining = Math.max(0, total - paid)
	const status: InvoiceStatus =
		remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid"
	return {
		...invoice,
		paid: fromCents(paid),
		remaining: fromCents(remaining),
		/** Overpaid by this much (a tip, or a mistake worth catching). */
		overpaid: fromCents(Math.max(0, paid - total)),
		status,
		progress: total > 0 ? Math.min(1, paid / total) : 1,
		paidAt:
			status === "paid" ? (sorted.at(-1)?.date ?? invoice.date) : null,
		/** Oldest first, each with what was still owed after it. */
		payments: withRunning,
	}
}

/** WorkInvoice values accepted by validation and routes. */
export type WorkInvoice = ReturnType<typeof summarizeInvoice>

/** Billable vs paid hours summary for a work job. */
export function summarizeJob(
	job: WorkJobRow,
	invoices: WorkInvoiceRow[],
	entries: WorkEntryRow[],
	payments: WorkPaymentRow[],
	today: string
) {
	const mine = invoices.filter((i) => i.jobId === job.id).toSorted(byDate)
	const summarized = mine.map((i) => summarizeInvoice(i, payments))
	const unbilled = entries
		.filter((entry) => entry.jobId === job.id && !entry.invoiceId)
		.toSorted(byDate)
		.toReversed()
	const unbilledHours = roundHours(
		unbilled.reduce((runningHours, entry) => runningHours + entry.hours, 0)
	)
	const allPayments = summarized.flatMap((i) => i.payments).toSorted(byDate)
	const owed = sumCents(summarized, (i) => i.remaining)
	const month = today.slice(0, 7)
	const lastCounter =
		[...mine].toReversed().find((i) => i.counterHours !== null)
			?.counterHours ?? null
	const lastPaymentDate = allPayments.at(-1)?.date ?? null

	// When the next instalment should land, and when the balance is cleared at the usual pace.
	let nextPaymentDate: string | null = null
	let paymentsLeft: number | null = null
	let payoffDate: string | null = null
	if (
		owed > 0 &&
		job.payAmount &&
		job.payAmount > 0 &&
		job.payEveryDays &&
		job.payEveryDays > 0
	) {
		const oldestOpen = summarized.find((i) => i.status !== "paid")
		const base =
			[lastPaymentDate, oldestOpen?.date]
				.filter((d): d is string => !!d)
				.toSorted()
				.at(-1) ?? today
		nextPaymentDate = addDays(base, job.payEveryDays)
		if (nextPaymentDate < today) {
			nextPaymentDate = today
		}
		paymentsLeft = Math.ceil(owed / toCents(job.payAmount))
		payoffDate = addDays(
			nextPaymentDate,
			(paymentsLeft - 1) * job.payEveryDays
		)
	}

	return {
		...job,
		owed: fromCents(owed),
		billedHours: roundHours(
			mine.reduce((runningHours, i) => runningHours + i.hours, 0)
		),
		billedTotal: fromCents(sumCents(mine, (i) => i.total)),
		paidTotal: fromCents(
			sumCents(allPayments, (payment) => payment.amount)
		),
		paidThisMonth: fromCents(
			sumCents(
				allPayments.filter((payment) => payment.date.startsWith(month)),
				(payment) => payment.amount
			)
		),
		unbilledHours,
		unbilledValue: mulMoney(job.rate, unbilledHours),
		/** The tracker's total at the last bill, so the next bill can work out "hours since". */
		lastCounter,
		lastPaymentDate,
		nextPaymentDate,
		paymentsLeft,
		payoffDate,
		/** Newest first. */
		invoices: summarized.toReversed(),
		unbilled,
	}
}

/** WorkJob values accepted by validation and routes. */
export type WorkJob = ReturnType<typeof summarizeJob>
