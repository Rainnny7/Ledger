import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core"
import { user } from "./auth.ts"
import { bankAccount, bankTransaction } from "./banks.ts"
import { centsCheck, timestampNow } from "./columns.ts"
import { workInvoice } from "./work.ts"

/** "Always file <merchant> under <category>" rules set from the transaction sheet. */
export const categoryRule = sqliteTable(
	"category_rule",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		merchantKey: text("merchant_key").notNull(),
		category: text("category").notNull(),
		createdAt: timestampNow("created_at"),
	},
	(table) => [primaryKey({ columns: [table.userId, table.merchantKey] })]
)

/** "Always tag <merchant> as business / personal" rules, for the tax report. */
export const taxRule = sqliteTable(
	"tax_rule",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		merchantKey: text("merchant_key").notNull(),
		/** business | personal */
		tag: text("tag").notNull(),
		createdAt: timestampNow("created_at"),
	},
	(table) => [primaryKey({ columns: [table.userId, table.merchantKey] })]
)

/** Recurring plans the user tracks. Amount is integer cents. */
export const subscription = sqliteTable(
	"subscription",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		amount: integer("amount").notNull(),
		currency: text("currency").notNull().default("CAD"),
		/** A preset (weekly ... triennial) or every-<n>-<weeks|months|years>. */
		cycle: text("cycle").notNull(),
		/** A known billing date; next due rolls forward from it. */
		anchorDate: text("anchor_date").notNull(),
		category: text("category").notNull().default("subscriptions"),
		accountId: text("account_id").references(() => bankAccount.id, {
			onDelete: "set null",
		}),
		/** Links to matching bank transactions. */
		merchantKey: text("merchant_key"),
		notes: text("notes"),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		createdAt: timestampNow("created_at"),
	},
	(table) => [
		index("idx_sub_user").on(table.userId),
		centsCheck("subscription", table.amount, { minimum: 0 }),
	]
)

/**
 * Charges the user counted toward a subscription by hand (a different merchant name or price than
 * the plan's). Each one also teaches the plan to match later charges like it.
 */
export const subscriptionCharge = sqliteTable(
	"subscription_charge",
	{
		subscriptionId: text("subscription_id")
			.notNull()
			.references(() => subscription.id, { onDelete: "cascade" }),
		transactionId: text("transaction_id")
			.notNull()
			.references(() => bankTransaction.id, { onDelete: "cascade" }),
		createdAt: timestampNow("created_at"),
	},
	(table) => [
		primaryKey({ columns: [table.subscriptionId, table.transactionId] }),
		index("idx_sub_charge_tx").on(table.transactionId),
	]
)

/** Merchants the user dismissed from "detected recurring charges". */
export const subscriptionDismissed = sqliteTable(
	"subscription_dismissed",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		merchantKey: text("merchant_key").notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.merchantKey] })]
)

/** Advisor tips the user hid: until a date (snoozed) or for good (until NULL). */
export const adviceDismissed = sqliteTable(
	"advice_dismissed",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		tipId: text("tip_id").notNull(),
		until: text("until"),
		createdAt: timestampNow("created_at"),
	},
	(table) => [primaryKey({ columns: [table.userId, table.tipId] })]
)

/** A monthly spending limit per category, in the user's home currency. Amount is integer cents. */
export const budget = sqliteTable(
	"budget",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		category: text("category").notNull(),
		amount: integer("amount").notNull(),
		currency: text("currency").notNull(),
		updatedAt: timestampNow("updated_at"),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.category] }),
		centsCheck("budget", table.amount, { minimum: 0 }),
	]
)

/** Savings / pay-off goals. Target is integer cents. */
export const goal = sqliteTable(
	"goal",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		/** save | payoff */
		kind: text("kind").notNull().default("save"),
		target: integer("target").notNull(),
		currency: text("currency").notNull().default("CAD"),
		/** YYYY-MM-DD, optional. */
		targetDate: text("target_date"),
		icon: text("icon").notNull().default("target"),
		color: text("color").notNull().default("sunset"),
		notes: text("notes"),
		archived: integer("archived", { mode: "boolean" })
			.notNull()
			.default(false),
		createdAt: timestampNow("created_at"),
	},
	(table) => [
		index("idx_goal_user").on(table.userId),
		centsCheck("goal", table.target, { minimum: 0 }),
	]
)

/** Partial payments logged toward a goal. Negative amount = withdrawn from the goal. */
export const goalPayment = sqliteTable(
	"goal_payment",
	{
		id: text("id").primaryKey(),
		goalId: text("goal_id")
			.notNull()
			.references(() => goal.id, { onDelete: "cascade" }),
		amount: integer("amount").notNull(),
		date: text("date").notNull(),
		note: text("note"),
		transactionId: text("transaction_id").references(
			() => bankTransaction.id,
			{ onDelete: "set null" }
		),
		createdAt: timestampNow("created_at"),
	},
	(table) => [
		index("idx_goal_payment_goal").on(table.goalId, table.date),
		centsCheck("goal_payment", table.amount),
	]
)

/** Ways clients can pay you (e-Transfer email, PayPal.me, a crypto address...), reused across invoices. */
export const paymentMethod = sqliteTable(
	"payment_method",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text("kind").notNull(),
		label: text("label").notNull(),
		fieldsJson: text("fields_json").notNull().default("{}"),
		/** Ticked on new invoices. */
		isDefault: integer("is_default", { mode: "boolean" })
			.notNull()
			.default(false),
		createdAt: timestampNow("created_at"),
	},
	(table) => [index("idx_payment_method_user").on(table.userId)]
)

/** Your own details and defaults for new invoices. */
export const invoiceProfile = sqliteTable("invoice_profile", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	json: text("json").notNull(),
})

/** Invoices you send to clients. Line items, parties and chosen payment methods are JSON. */
export const invoice = sqliteTable(
	"invoice",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		number: text("number").notNull(),
		/** The secret in the share link (/i/<token>). */
		token: text("token").notNull().unique(),
		/** draft | sent | void (paid is worked out from payments). */
		status: text("status").notNull().default("draft"),
		template: text("template").notNull().default("modern"),
		theme: text("theme").notNull().default("professional"),
		currency: text("currency").notNull().default("CAD"),
		issueDate: text("issue_date").notNull(),
		dueDate: text("due_date"),
		/** {name,email,phone,address,taxId} */
		fromJson: text("from_json").notNull(),
		clientJson: text("client_json").notNull(),
		/** [{description,quantity,unitPriceCents}] */
		itemsJson: text("items_json").notNull(),
		/** Percent. */
		taxRate: real("tax_rate").notNull().default(0),
		taxLabel: text("tax_label").notNull().default("Tax"),
		/** Flat amount off the subtotal, integer cents. */
		discount: integer("discount").notNull().default(0),
		notes: text("notes"),
		terms: text("terms"),
		/** Ids of payment_method rows offered on the invoice. */
		methodsJson: text("methods_json").notNull().default("[]"),
		/** Billed from a Work bill: its payments count. */
		workInvoiceId: text("work_invoice_id").references(
			() => workInvoice.id,
			{
				onDelete: "set null",
			}
		),
		sentAt: text("sent_at"),
		viewedAt: text("viewed_at"),
		createdAt: timestampNow("created_at"),
		updatedAt: timestampNow("updated_at"),
	},
	(table) => [
		index("idx_invoice_user").on(table.userId, table.issueDate),
		centsCheck("invoice", table.discount, { minimum: 0 }),
	]
)

/** A payment received against an invoice you sent. */
export const invoicePayment = sqliteTable(
	"invoice_payment",
	{
		id: text("id").primaryKey(),
		invoiceId: text("invoice_id")
			.notNull()
			.references(() => invoice.id, { onDelete: "cascade" }),
		amount: integer("amount").notNull(),
		date: text("date").notNull(),
		method: text("method"),
		note: text("note"),
		transactionId: text("transaction_id").references(
			() => bankTransaction.id,
			{ onDelete: "set null" }
		),
		/** PayPal capture id, so a webhook and a redirect don't count it twice. */
		externalId: text("external_id").unique(),
		createdAt: timestampNow("created_at"),
	},
	(table) => [
		index("idx_invoice_payment_invoice").on(table.invoiceId, table.date),
		centsCheck("invoice_payment", table.amount),
	]
)
