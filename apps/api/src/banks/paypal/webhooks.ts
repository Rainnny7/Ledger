/**
 * Instant updates from PayPal. Each PayPal connection can register a webhook on its REST app
 * (see api.ts); deliveries land on /api/webhooks/paypal/<connection id>, are checked with PayPal,
 * and then:
 *
 * - a completed capture is added to the PayPal balance right away (the sync would only see it
 *   hours later), and, when it paid one of your invoices, recorded as that invoice's payment;
 * - an approved checkout that the payer never returned from is captured here;
 * - refunds and reversals take the money back off.
 */
import { and, eq, sql } from "drizzle-orm"
import { db } from "../../db/connection.ts"
import {
	bankConnection,
	invoice as invoiceTable,
	paypalWebhookEvent,
} from "../../db/schema/index.ts"
import { loadById, recordInvoicePayment } from "../../finance/invoice-store.ts"
import { type Capture, captureOrder, verifyWebhook } from "./api.ts"
import { recordPaypalTransaction } from "../store.ts"

interface WebhookEvent {
	id: string
	event_type: string
	resource?: Record<string, unknown>
}

const today = () => new Date().toISOString().slice(0, 10)
const day = (iso?: unknown) =>
	typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso)
		? iso.slice(0, 10)
		: today()

/** The invoice a payment was for, only if it belongs to the connection's owner. */
function invoiceFor(userId: string, customId: unknown) {
	if (typeof customId !== "string" || !customId) {
		return null
	}
	const found = loadById(customId)
	return found && found.userId === userId ? found.invoice : null
}

/** Books a completed capture: the balance, and the invoice it paid. Safe to call twice for the same capture. */
export function recordCapture(
	connection: { id: string; userId: string },
	capture: Capture,
	customId: string | null
) {
	if (capture.status !== "COMPLETED") {
		return
	}
	const invoice = invoiceFor(connection.userId, customId ?? capture.custom_id)
	const currency = capture.amount.currency_code
	const gross = Number(capture.amount.value)
	const net = Number(
		capture.seller_receivable_breakdown?.net_amount?.value ??
			capture.amount.value
	)
	const date = day(capture.create_time)
	const transactionId = recordPaypalTransaction(connection.id, {
		id: capture.id,
		date,
		description: invoice
			? `${invoice.client.name || "Client"} · Invoice ${invoice.number}`
			: "Payment received",
		amount: net,
		currency,
	})
	if (invoice) {
		recordInvoicePayment(invoice, {
			amount: gross,
			date,
			method: "PayPal",
			externalId: capture.id,
			transactionId,
		})
		db.update(invoiceTable)
			.set({
				status: "sent",
				sentAt: sql`COALESCE(${invoiceTable.sentAt}, datetime('now'))`,
			})
			.where(
				and(
					eq(invoiceTable.id, invoice.id),
					eq(invoiceTable.status, "draft")
				)
			)
			.run()
	}
}

/** WebhookResult values accepted by validation and routes. */
export type WebhookResult = { status: 200 | 400 | 401 | 404; message: string }

function applyWebhookEvent(
	conn: { id: string; userId: string },
	event: WebhookEvent,
	precapture?: { capture: Capture | null; customId: string | null }
) {
	const resource = event.resource ?? {}
	switch (event.event_type) {
		case "CHECKOUT.ORDER.APPROVED": {
			const { capture, customId } = precapture ?? {
				capture: null,
				customId: null,
			}
			if (capture) {
				recordCapture(conn, capture, customId)
			}
			break
		}
		case "PAYMENT.CAPTURE.COMPLETED":
			recordCapture(conn, resource as unknown as Capture, null)
			break
		case "PAYMENT.CAPTURE.REFUNDED":
		case "PAYMENT.CAPTURE.REVERSED": {
			const amount = resource.amount as
				| { value: string; currency_code: string }
				| undefined
			if (typeof resource.id !== "string" || !amount) {
				break
			}
			const value = Number(amount.value)
			const reversal = event.event_type === "PAYMENT.CAPTURE.REVERSED"
			const transactionId = reversal
				? null
				: recordPaypalTransaction(conn.id, {
						id: resource.id,
						date: day(resource.create_time),
						description: "Refund",
						amount: -value,
						currency: amount.currency_code,
					})
			const invoice = invoiceFor(conn.userId, resource.custom_id)
			if (invoice) {
				recordInvoicePayment(invoice, {
					amount: -value,
					date: day(resource.create_time ?? resource.update_time),
					method: "PayPal",
					note: reversal ? "Reversed by PayPal" : "Refunded",
					externalId: `${resource.id}:${reversal ? "reversed" : "refund"}`,
					transactionId,
				})
			}
			break
		}
	}
}

/** Verify and apply PayPal payment webhooks. */
export async function handlePaypalWebhook(
	connectionId: string,
	headers: Headers,
	raw: string
): Promise<WebhookResult> {
	const conn = db
		.select({
			id: bankConnection.id,
			userId: bankConnection.userId,
			webhookId: bankConnection.webhookId,
		})
		.from(bankConnection)
		.where(
			and(
				eq(bankConnection.id, connectionId),
				eq(bankConnection.institution, "paypal")
			)
		)
		.get()
	if (!conn?.webhookId) {
		return { status: 404, message: "Unknown webhook" }
	}

	let event: WebhookEvent
	try {
		event = JSON.parse(raw) as WebhookEvent
	} catch {
		return { status: 400, message: "Bad JSON" }
	}
	if (typeof event?.id !== "string" || typeof event.event_type !== "string") {
		return { status: 400, message: "Not a PayPal event" }
	}

	if (!(await verifyWebhook(conn.id, conn.webhookId, headers, event))) {
		return { status: 401, message: "Signature check failed" }
	}

	let precapture:
		| { capture: Capture | null; customId: string | null }
		| undefined
	if (
		event.event_type === "CHECKOUT.ORDER.APPROVED" &&
		typeof event.resource?.id === "string"
	) {
		precapture = await captureOrder(conn.id, event.resource.id)
	}

	const exists = db
		.select({ id: paypalWebhookEvent.id })
		.from(paypalWebhookEvent)
		.where(eq(paypalWebhookEvent.id, event.id))
		.get()
	if (exists) {
		return { status: 200, message: "Already handled" }
	}

	const handled = db.transaction((tx) => {
		const inserted = tx
			.insert(paypalWebhookEvent)
			.values({
				id: event.id,
				connectionId: conn.id,
				type: event.event_type,
			})
			.returning({ id: paypalWebhookEvent.id })
			.all()
		if (!inserted.length) {
			return false
		}
		applyWebhookEvent(conn, event, precapture)
		tx.update(bankConnection)
			.set({ webhookAt: sql`datetime('now')` })
			.where(eq(bankConnection.id, conn.id))
			.run()
		return true
	})
	return handled
		? { status: 200, message: "OK" }
		: { status: 200, message: "Already handled" }
}
