/**
 * The parts of PayPal's REST API that act on a connected app rather than read history:
 * webhooks (instant updates) and Orders (a "Pay with PayPal" button on invoices).
 *
 * PayPal webhooks are scoped to the REST app they're registered on, so they fire for payments made
 * *through that app* (invoice checkouts, refunds of them), not for every movement on the account.
 * Everything else still arrives through the regular Transaction Search sync.
 */
import { decrypt } from "../../security/crypto.ts"
import { env } from "../../config/env.ts"
import { and, eq } from "drizzle-orm"
import { db } from "../../db/connection.ts"
import { bankConnection } from "../../db/schema/index.ts"

/** PayPal REST API base URL from environment. */
export const PAYPAL_API =
	env.PAYPAL_ENV === "sandbox"
		? "https://api-m.sandbox.paypal.com"
		: "https://api-m.paypal.com"

/** The events Ledger listens for. Captures are money arriving; refunds/reversals are it leaving again. */
export const WEBHOOK_EVENTS = [
	"CHECKOUT.ORDER.APPROVED",
	"PAYMENT.CAPTURE.COMPLETED",
	"PAYMENT.CAPTURE.REFUNDED",
	"PAYMENT.CAPTURE.REVERSED",
] as const

/** PaypalApiError bank client implementation. */
export class PaypalApiError extends Error {
	readonly status: number
	/** PayPal's issue code, e.g. ORDER_ALREADY_CAPTURED. */
	readonly issue: string | null
	constructor(message: string, status: number, issue: string | null = null) {
		super(message)
		this.status = status
		this.issue = issue
	}
}

const tokens = new Map<string, { token: string; expires: number }>()

/** Drop cached OAuth token after credential rotation. */
export function purgePaypalTokenCache(connectionId: string) {
	tokens.delete(connectionId)
}

/** The connection's REST app credentials (stored encrypted as {username: clientId, password: secret}). */
function credentials(connectionId: string) {
	const row = db
		.select({ enc: bankConnection.credentialsEnc })
		.from(bankConnection)
		.where(
			and(
				eq(bankConnection.id, connectionId),
				eq(bankConnection.institution, "paypal")
			)
		)
		.get()
	if (!row?.enc) {
		purgePaypalTokenCache(connectionId)
		throw new PaypalApiError(
			"That PayPal connection has no saved app details.",
			400
		)
	}
	const accountCredentials = decrypt<{ username: string; password: string }>(
		row.enc
	)
	return {
		clientId: accountCredentials.username.trim(),
		secret: accountCredentials.password.trim(),
	}
}

async function accessToken(connectionId: string) {
	const cached = tokens.get(connectionId)
	if (cached && cached.expires > Date.now() + 60_000) {
		return cached.token
	}
	const { clientId, secret } = credentials(connectionId)
	const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
		method: "POST",
		headers: {
			Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
		signal: AbortSignal.timeout(20_000),
	})
	if (!response.ok) {
		throw new PaypalApiError(
			`PayPal login failed (HTTP ${response.status}).`,
			response.status
		)
	}
	const body = (await response.json()) as {
		access_token: string
		expires_in?: number
	}
	tokens.set(connectionId, {
		token: body.access_token,
		expires: Date.now() + (body.expires_in ?? 3600) * 1000,
	})
	return body.access_token
}

/** Authenticated PayPal REST call with token refresh. */
export async function paypalRequest<T>(
	connectionId: string,
	method: string,
	path: string,
	body?: unknown
): Promise<T> {
	const response = await fetch(`${PAYPAL_API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${await accessToken(connectionId)}`,
			"Content-Type": "application/json",
			Accept: "application/json",
			Prefer: "return=representation",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(30_000),
	})
	if (response.status === 204) {
		return undefined as T
	}
	const json = (await response.json().catch(() => null)) as
		| (T & {
				name?: string
				message?: string
				details?: { issue?: string; description?: string }[]
		  })
		| null
	if (!response.ok) {
		const detail = json?.details?.[0]
		throw new PaypalApiError(
			detail?.description ??
				json?.message ??
				`PayPal returned HTTP ${response.status}.`,
			response.status,
			detail?.issue ?? json?.name ?? null
		)
	}
	return json as T
}

// ---------------------------------------------------------------- webhooks

interface WebhookList {
	webhooks: { id: string; url: string }[]
}

/** Registers (or finds) the webhook for `url` on the connection's app and returns its id. */
export async function registerWebhook(connectionId: string, url: string) {
	const existing = await paypalRequest<WebhookList>(
		connectionId,
		"GET",
		"/v1/notifications/webhooks"
	)
	const found = existing.webhooks.find((webhook) => webhook.url === url)
	const event_types = WEBHOOK_EVENTS.map((name) => ({ name }))
	if (found) {
		await paypalRequest(
			connectionId,
			"PATCH",
			`/v1/notifications/webhooks/${found.id}`,
			[{ op: "replace", path: "/event_types", value: event_types }]
		)
		return found.id
	}
	const created = await paypalRequest<{ id: string }>(
		connectionId,
		"POST",
		"/v1/notifications/webhooks",
		{ url, event_types }
	)
	return created.id
}

/** Remove a PayPal webhook subscription. */
export async function deleteWebhook(connectionId: string, webhookId: string) {
	try {
		await paypalRequest(
			connectionId,
			"DELETE",
			`/v1/notifications/webhooks/${encodeURIComponent(webhookId)}`
		)
	} catch (error) {
		// Already gone on PayPal's side is fine.
		if (!(error instanceof PaypalApiError) || error.status !== 404) {
			throw error
		}
	}
}

/**
 * Asks PayPal whether a delivery really came from it. PayPal recomputes the signature over the
 * event as we send it back, so the parsed body is passed through unchanged.
 */
export async function verifyWebhook(
	connectionId: string,
	webhookId: string,
	headers: Headers,
	event: unknown
) {
	const header = (headerName: string) => headers.get(headerName) ?? ""
	if (!header("paypal-transmission-sig") || !header("paypal-cert-url")) {
		return false
	}
	const verification = await paypalRequest<{ verification_status: string }>(
		connectionId,
		"POST",
		"/v1/notifications/verify-webhook-signature",
		{
			auth_algo: header("paypal-auth-algo"),
			cert_url: header("paypal-cert-url"),
			transmission_id: header("paypal-transmission-id"),
			transmission_sig: header("paypal-transmission-sig"),
			transmission_time: header("paypal-transmission-time"),
			webhook_id: webhookId,
			webhook_event: event,
		}
	)
	return verification.verification_status === "SUCCESS"
}

// ---------------------------------------------------------------- orders (invoice checkout)

/** Shape of Capture as stored and returned by the API. */
export interface Capture {
	id: string
	status: string
	amount: { currency_code: string; value: string }
	seller_receivable_breakdown?: { net_amount?: { value: string } }
	custom_id?: string
	create_time?: string
}

interface Order {
	id: string
	status: string
	links?: { rel: string; href: string }[]
	purchase_units?: {
		custom_id?: string
		payments?: { captures?: Capture[] }
	}[]
}

/** Create a PayPal checkout order for invoice payment. */
export async function createOrder(
	connectionId: string,
	o: {
		invoiceId: string
		description: string
		currency: string
		amount: number
		brand: string
		returnUrl: string
		cancelUrl: string
	}
) {
	const order = await paypalRequest<Order>(
		connectionId,
		"POST",
		"/v2/checkout/orders",
		{
			intent: "CAPTURE",
			purchase_units: [
				{
					reference_id: o.invoiceId,
					custom_id: o.invoiceId,
					description: o.description.slice(0, 127),
					amount: {
						currency_code: o.currency,
						value: o.amount.toFixed(2),
					},
				},
			],
			payment_source: {
				paypal: {
					experience_context: {
						brand_name: o.brand.slice(0, 127) || undefined,
						user_action: "PAY_NOW",
						shipping_preference: "NO_SHIPPING",
						return_url: o.returnUrl,
						cancel_url: o.cancelUrl,
					},
				},
			},
		}
	)
	const approve = order.links?.find(
		(link) => link.rel === "payer-action" || link.rel === "approve"
	)?.href
	if (!approve) {
		throw new PaypalApiError("PayPal did not return a checkout link.", 502)
	}
	return { orderId: order.id, approveUrl: approve }
}

/** Fetch PayPal order details for capture status. */
export async function getOrder(connectionId: string, orderId: string) {
	return paypalRequest<Order>(
		connectionId,
		"GET",
		`/v2/checkout/orders/${encodeURIComponent(orderId)}`
	)
}

/** Captures an approved order. Returns the completed capture (also when it was captured already). */
export async function captureOrder(
	connectionId: string,
	orderId: string
): Promise<{ customId: string | null; capture: Capture | null }> {
	let order: Order
	try {
		order = await paypalRequest<Order>(
			connectionId,
			"POST",
			`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
			{}
		)
	} catch (error) {
		if (
			error instanceof PaypalApiError &&
			error.issue === "ORDER_ALREADY_CAPTURED"
		) {
			order = await getOrder(connectionId, orderId)
		} else {
			throw error
		}
	}
	const unit = order.purchase_units?.[0]
	const capture =
		unit?.payments?.captures?.find(
			(completedCapture) => completedCapture.status === "COMPLETED"
		) ?? null
	return { customId: unit?.custom_id ?? capture?.custom_id ?? null, capture }
}
