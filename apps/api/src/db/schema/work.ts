import { sql } from "drizzle-orm"
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core"
import { user } from "./auth.ts"
import { bankTransaction } from "./banks.ts"
import { centsCheck, timestampNow } from "./columns.ts"

/** Work-hours tracking for side jobs paid by the hour, in instalments. Money is integer cents. */
export const workJob = sqliteTable(
	"work_job",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		/** Per hour. */
		rate: integer("rate").notNull(),
		currency: text("currency").notNull().default("CAD"),
		/** Usual instalment, e.g. 250 (optional). */
		payAmount: integer("pay_amount"),
		/** How often instalments come, e.g. 7 (optional). */
		payEveryDays: integer("pay_every_days"),
		color: text("color").notNull().default("ocean"),
		notes: text("notes"),
		archived: integer("archived", { mode: "boolean" })
			.notNull()
			.default(false),
		createdAt: timestampNow("created_at"),
	},
	(table) => [
		index("idx_work_job_user").on(table.userId),
		centsCheck("work_job", table.rate, { minimum: 0 }),
		centsCheck("work_job", table.payAmount, { nullable: true, minimum: 0 }),
	]
)

/** A bill: "done N hours since last pay, total is $X". Paid off in instalments. */
export const workInvoice = sqliteTable(
	"work_invoice",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => workJob.id, { onDelete: "cascade" }),
		date: text("date").notNull(),
		hours: real("hours").notNull(),
		rate: integer("rate").notNull(),
		/** Usually hours x rate, but can be agreed differently. */
		total: integer("total").notNull(),
		/** The time tracker's running total when billed, if used. */
		counterHours: real("counter_hours"),
		/** Screenshot of the tracker. */
		proofUrl: text("proof_url"),
		note: text("note"),
		createdAt: timestampNow("created_at"),
	},
	(table) => [
		index("idx_work_invoice_job").on(table.jobId, table.date),
		centsCheck("work_invoice", table.rate, { minimum: 0 }),
		centsCheck("work_invoice", table.total, { minimum: 0 }),
	]
)

/** Shifts logged as you go; bundled into the next bill. */
export const workEntry = sqliteTable(
	"work_entry",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => workJob.id, { onDelete: "cascade" }),
		date: text("date").notNull(),
		hours: real("hours").notNull(),
		note: text("note"),
		invoiceId: text("invoice_id").references(() => workInvoice.id, {
			onDelete: "set null",
		}),
		createdAt: timestampNow("created_at"),
	},
	(table) => [index("idx_work_entry_job").on(table.jobId, table.date)]
)

/** A payment toward a work bill. */
export const workPayment = sqliteTable(
	"work_payment",
	{
		id: text("id").primaryKey(),
		invoiceId: text("invoice_id")
			.notNull()
			.references(() => workInvoice.id, { onDelete: "cascade" }),
		amount: integer("amount").notNull(),
		date: text("date").notNull(),
		note: text("note"),
		transactionId: text("transaction_id").references(
			() => bankTransaction.id,
			{ onDelete: "set null" }
		),
		createdAt: timestampNow("created_at"),
		/** PayPal capture id, so checkout payments are only counted once. */
		externalId: text("external_id"),
		/** Paid in one currency, arrived in another. */
		receivedAmount: integer("received_amount"),
		receivedCurrency: text("received_currency"),
	},
	(table) => [
		index("idx_work_payment_invoice").on(table.invoiceId, table.date),
		uniqueIndex("idx_work_payment_external")
			.on(table.externalId)
			.where(sql`${table.externalId} IS NOT NULL`),
		centsCheck("work_payment", table.amount),
		centsCheck("work_payment", table.receivedAmount, { nullable: true }),
	]
)
