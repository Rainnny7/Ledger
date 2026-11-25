import { desc } from "drizzle-orm"
import {
	index,
	integer,
	sqliteTable,
	text,
	unique,
} from "drizzle-orm/sqlite-core"
import { user } from "./auth.ts"
import { centsCheck, timestampNow } from "./columns.ts"

/** A linked bank login (TD scraper or PayPal API). Secrets are AES-GCM encrypted `*_enc` text. */
export const bankConnection = sqliteTable(
	"bank_connection",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		institution: text("institution").notNull(),
		label: text("label").notNull(),
		usernameMasked: text("username_masked").notNull(),
		/** Encrypted `{username,password}`, only if the user opted in. */
		credentialsEnc: text("credentials_enc"),
		/** Encrypted Playwright storage state (remembers the device, so fewer 2FA prompts). */
		browserStateEnc: text("browser_state_enc"),
		status: text("status").notNull().default("active"),
		lastSyncedAt: text("last_synced_at"),
		lastError: text("last_error"),
		createdAt: timestampNow("created_at"),
		/** PayPal: the webhook registered on the user's REST app for instant updates. */
		webhookId: text("webhook_id"),
		webhookAt: text("webhook_at"),
	},
	(table) => [index("idx_connection_user").on(table.userId)]
)

/** An account at a bank. Money columns are integer cents. */
export const bankAccount = sqliteTable(
	"bank_account",
	{
		id: text("id").primaryKey(),
		connectionId: text("connection_id")
			.notNull()
			.references(() => bankConnection.id, { onDelete: "cascade" }),
		/** Stable key from the bank (masked number + name). */
		externalKey: text("external_key").notNull(),
		name: text("name").notNull(),
		/** chequing | savings | credit | loan | investment | wallet | other */
		type: text("type").notNull(),
		numberMasked: text("number_masked"),
		currency: text("currency").notNull().default("CAD"),
		balance: integer("balance"),
		available: integer("available"),
		overdraftLimit: integer("overdraft_limit"),
		overdraftUsed: integer("overdraft_used"),
		creditLimit: integer("credit_limit"),
		updatedAt: timestampNow("updated_at"),
		/** Earliest date a full history read has reached (null means a full backfill next sync). */
		historyFrom: text("history_from"),
		/** Direct deposit numbers and limits (encrypted JSON, includes the full account number). */
		detailsEnc: text("details_enc"),
		detailsUpdatedAt: text("details_updated_at"),
	},
	(table) => [
		unique().on(table.connectionId, table.externalKey),
		centsCheck("bank_account", table.balance, { nullable: true }),
		centsCheck("bank_account", table.available, { nullable: true }),
		centsCheck("bank_account", table.overdraftLimit, { nullable: true }),
		centsCheck("bank_account", table.overdraftUsed, { nullable: true }),
		centsCheck("bank_account", table.creditLimit, { nullable: true }),
	]
)

/** A transaction on a bank account. Amount is integer cents, negative = money out. */
export const bankTransaction = sqliteTable(
	"bank_transaction",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id")
			.notNull()
			.references(() => bankAccount.id, { onDelete: "cascade" }),
		/** Dedupe key: date|description|amount|occurrence. */
		fingerprint: text("fingerprint").notNull(),
		/** YYYY-MM-DD */
		date: text("date").notNull(),
		description: text("description").notNull(),
		amount: integer("amount").notNull(),
		runningBalance: integer("running_balance"),
		pending: integer("pending", { mode: "boolean" })
			.notNull()
			.default(false),
		createdAt: timestampNow("created_at"),
		categoryOverride: text("category_override"),
		note: text("note"),
		/** business | personal, for the tax report. */
		taxTag: text("tax_tag"),
	},
	(table) => [
		unique().on(table.accountId, table.fingerprint),
		index("idx_tx_account_date").on(table.accountId, desc(table.date)),
		index("idx_tx_account_date_id").on(
			table.accountId,
			desc(table.date),
			desc(table.id)
		),
		centsCheck("bank_transaction", table.amount),
		centsCheck("bank_transaction", table.runningBalance, {
			nullable: true,
		}),
	]
)

/** PayPal webhook deliveries already handled (PayPal retries, so the same one can arrive twice). */
export const paypalWebhookEvent = sqliteTable("paypal_webhook_event", {
	id: text("id").primaryKey(),
	connectionId: text("connection_id")
		.notNull()
		.references(() => bankConnection.id, { onDelete: "cascade" }),
	type: text("type").notNull(),
	receivedAt: timestampNow("received_at"),
})
