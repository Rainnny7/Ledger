import { Elysia } from "elysia"
import { z } from "zod"
import { jsonBody, token } from "../../http/validation.ts"
import { auth } from "../../auth/index.ts"
import {
	createOrder,
	captureOrder,
	PaypalApiError,
} from "../../banks/paypal/api.ts"
import { recordCapture } from "../../banks/paypal/webhooks.ts"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db/connection.ts"
import {
	bankConnection,
	invoice as invoiceTable,
} from "../../db/schema/index.ts"
import { env } from "../../config/env.ts"
import {
	type InvoiceView,
	loadByToken,
	loadPaymentMethods,
	type PaymentMethod,
} from "../../finance/invoice-store.ts"

// ---------------------------------------------------------------- public (share link, no login)

/** Elysia plugin wiring HTTP handlers for this area. */
export const publicInvoices = new Elysia({ name: "publicInvoices" })

const tokenParam = z.object({ token })
const captureBody = z.object({
	orderId: z.string().regex(/^[A-Z0-9]{5,40}$/),
})

/** What the person you billed sees: no internal ids, and only the payment details you chose to show. */
function publicView(invoice: InvoiceView, methods: PaymentMethod[]) {
	const {
		id: _id,
		token: _t,
		methodIds,
		workInvoiceId: _w,
		sentAt: _s,
		viewedAt: _v,
		createdAt: _c,
		updatedAt: _u,
		payments: _p,
		...rest
	} = invoice
	const byId = new Map(methods.map((method) => [method.id, method]))
	const offered = methodIds
		.map((id) => byId.get(id))
		.filter((m): m is PaymentMethod => !!m)
		// The PayPal checkout needs a live connection; its id stays private.
		.filter(
			(method) =>
				method.kind !== "paypal-checkout" ||
				hasPaypal(method.fields.connectionId)
		)
		.map((method) => ({
			id: method.id,
			kind: method.kind,
			label: method.label,
			fields: method.kind === "paypal-checkout" ? {} : method.fields,
		}))
	return { ...rest, methods: offered }
}

const hasPaypal = (connectionId: string | undefined) =>
	!!connectionId &&
	!!db
		.select({ id: bankConnection.id })
		.from(bankConnection)
		.where(
			and(
				eq(bankConnection.id, connectionId),
				eq(bankConnection.institution, "paypal"),
				isNotNull(bankConnection.credentialsEnc)
			)
		)
		.get()

function checkoutConnection(userId: string, invoice: InvoiceView) {
	const onInvoice = new Set(invoice.methodIds)
	const method = loadPaymentMethods(userId).find(
		(candidateMethod) =>
			candidateMethod.kind === "paypal-checkout" &&
			onInvoice.has(candidateMethod.id)
	)
	const id = method?.fields.connectionId
	const owned =
		id &&
		db
			.select({ id: bankConnection.id })
			.from(bankConnection)
			.where(
				and(
					eq(bankConnection.id, id),
					eq(bankConnection.userId, userId),
					eq(bankConnection.institution, "paypal")
				)
			)
			.get()
	return owned ? id : null
}

publicInvoices.get(
	"/invoices/:token",
	async ({ params, set, status, request }) => {
		const { token: shareToken } = params
		const found = loadByToken(shareToken)
		if (!found) {
			return status(404, {
				error: "This invoice link is not valid any more.",
			})
		}
		// Note the first time someone other than you opens it.
		if (!found.invoice.viewedAt) {
			const session = await auth.api
				.getSession({ headers: request.headers })
				.catch(() => null)
			if (session?.user.id !== found.userId) {
				db.update(invoiceTable)
					.set({ viewedAt: sql`datetime('now')` })
					.where(eq(invoiceTable.id, found.invoice.id))
					.run()
			}
		}
		set.headers["cache-control"] = "no-store"
		set.headers["x-robots-tag"] = "noindex"
		return {
			invoice: publicView(
				found.invoice,
				loadPaymentMethods(found.userId)
			),
		}
	},
	{ params: tokenParam }
)

/** A few checkout attempts per link per minute is plenty for a person. */
const attempts = new Map<string, number[]>()
function limited(key: string) {
	const now = Date.now()
	const recent = (attempts.get(key) ?? []).filter(
		(timestamp) => now - timestamp < 60_000
	)
	recent.push(now)
	attempts.set(key, recent)
	// Drop only idle entries; clearing everything would allow a burst of requests reset every link's count.
	if (attempts.size > 5000) {
		for (const [k, times] of attempts) {
			if (times.every((time) => now - time >= 60_000)) {
				attempts.delete(k)
			}
		}
	}
	return recent.length > 10
}

publicInvoices.post(
	"/invoices/:token/paypal",
	async ({ params, status }) => {
		const { token: shareToken } = params
		// Only real links are counted, so made-up tokens can't fill the table.
		const found = loadByToken(shareToken)
		if (!found) {
			return status(404, {
				error: "This invoice link is not valid any more.",
			})
		}
		if (limited(shareToken)) {
			return status(429, {
				error: "Too many attempts. Wait a minute and try again.",
			})
		}
		const { invoice, userId } = found
		if (invoice.status === "void") {
			return status(400, { error: "This invoice was cancelled." })
		}
		if (invoice.balance <= 0) {
			return status(400, { error: "This invoice is already paid." })
		}
		const connectionId = checkoutConnection(userId, invoice)
		if (!connectionId) {
			return status(400, {
				error: "Paying by PayPal is not available on this invoice.",
			})
		}
		const page = `${env.PUBLIC_URL}/i/${encodeURIComponent(shareToken)}`
		try {
			const { approveUrl } = await createOrder(connectionId, {
				invoiceId: invoice.id,
				description: `Invoice ${invoice.number}${invoice.from.name ? ` from ${invoice.from.name}` : ""}`,
				currency: invoice.currency,
				amount: invoice.balance,
				brand: invoice.from.name,
				returnUrl: `${page}?paypal=return`,
				cancelUrl: `${page}?paypal=cancel`,
			})
			return { url: approveUrl }
		} catch (error) {
			console.error("PayPal order failed", error)
			return status(502, {
				error:
					error instanceof PaypalApiError
						? `PayPal: ${error.message}`
						: "Could not start the PayPal checkout.",
			})
		}
	},
	{ params: tokenParam }
)

publicInvoices.post(
	"/invoices/:token/paypal/capture",
	async ({ params, body, status }) => {
		const { token: shareToken } = params
		const { orderId } = body
		const found = loadByToken(shareToken)
		if (!found) {
			return status(404, {
				error: "This invoice link is not valid any more.",
			})
		}
		if (limited(shareToken)) {
			return status(429, {
				error: "Too many attempts. Wait a minute and try again.",
			})
		}
		const { invoice, userId } = found
		if (invoice.status === "void") {
			return status(400, { error: "This invoice was cancelled." })
		}
		if (invoice.balance <= 0) {
			return status(400, { error: "This invoice is already paid." })
		}
		const connectionId = checkoutConnection(userId, invoice)
		if (!connectionId) {
			return status(400, {
				error: "Paying by PayPal is not available on this invoice.",
			})
		}
		try {
			const { capture, customId } = await captureOrder(
				connectionId,
				orderId
			)
			// Only an order made for this very invoice counts toward it.
			if (!capture || customId !== invoice.id) {
				return status(400, {
					error: "That PayPal payment did not go through.",
				})
			}
			recordCapture({ id: connectionId, userId }, capture, customId)
		} catch (error) {
			console.error("PayPal capture failed", error)
			return status(502, {
				error:
					error instanceof PaypalApiError
						? `PayPal: ${error.message}`
						: "Could not finish the PayPal payment.",
			})
		}
		const fresh = loadByToken(shareToken)
		return {
			invoice: fresh
				? publicView(fresh.invoice, loadPaymentMethods(userId))
				: null,
		}
	},
	{ params: tokenParam, body: jsonBody(captureBody) }
)
