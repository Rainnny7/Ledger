/**
 * The parts of PayPal's REST API that act on a connected app rather than read history:
 * webhooks (instant updates) and Orders (a "Pay with PayPal" button on invoices).
 *
 * PayPal webhooks are scoped to the REST app they're registered on, so they fire for payments made
 * *through that app* (invoice checkouts, refunds of them), not for every movement on the account.
 * Everything else still arrives through the regular Transaction Search sync.
 */
import { decrypt } from "../../crypto.ts"
import { db } from "../../db.ts"

export const PAYPAL_API =
  process.env.PAYPAL_ENV === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com"

/** The events Ledger listens for. Captures are money arriving; refunds/reversals are it leaving again. */
export const WEBHOOK_EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
] as const

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

export function purgePaypalTokenCache(connectionId: string) {
  tokens.delete(connectionId)
}

/** The connection's REST app credentials (stored encrypted as {username: clientId, password: secret}). */
function credentials(connectionId: string) {
  const row = db
    .prepare(
      `SELECT credentials_enc AS enc FROM bank_connection WHERE id = ? AND institution = 'paypal'`
    )
    .get(connectionId) as { enc: string | null } | undefined
  if (!row?.enc) {
    purgePaypalTokenCache(connectionId)
    throw new PaypalApiError(
      "That PayPal connection has no saved app details.",
      400
    )
  }
  const c = decrypt<{ username: string; password: string }>(row.enc)
  return { clientId: c.username.trim(), secret: c.password.trim() }
}

async function accessToken(connectionId: string) {
  const cached = tokens.get(connectionId)
  if (cached && cached.expires > Date.now() + 60_000) return cached.token
  const { clientId, secret } = credentials(connectionId)
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok)
    throw new PaypalApiError(
      `PayPal sign-in failed (HTTP ${res.status}).`,
      res.status
    )
  const body = (await res.json()) as {
    access_token: string
    expires_in?: number
  }
  tokens.set(connectionId, {
    token: body.access_token,
    expires: Date.now() + (body.expires_in ?? 3600) * 1000,
  })
  return body.access_token
}

export async function paypalRequest<T>(
  connectionId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${PAYPAL_API}${path}`, {
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
  if (res.status === 204) return undefined as T
  const json = (await res.json().catch(() => null)) as
    | (T & {
        name?: string
        message?: string
        details?: { issue?: string; description?: string }[]
      })
    | null
  if (!res.ok) {
    const detail = json?.details?.[0]
    throw new PaypalApiError(
      detail?.description ??
        json?.message ??
        `PayPal returned HTTP ${res.status}.`,
      res.status,
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
  const found = existing.webhooks.find((w) => w.url === url)
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

export async function deleteWebhook(connectionId: string, webhookId: string) {
  try {
    await paypalRequest(
      connectionId,
      "DELETE",
      `/v1/notifications/webhooks/${encodeURIComponent(webhookId)}`
    )
  } catch (e) {
    // Already gone on PayPal's side is fine.
    if (!(e instanceof PaypalApiError) || e.status !== 404) throw e
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
  const h = (k: string) => headers.get(k) ?? ""
  if (!h("paypal-transmission-sig") || !h("paypal-cert-url")) return false
  const r = await paypalRequest<{ verification_status: string }>(
    connectionId,
    "POST",
    "/v1/notifications/verify-webhook-signature",
    {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }
  )
  return r.verification_status === "SUCCESS"
}

// ---------------------------------------------------------------- orders (invoice checkout)

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
  purchase_units?: { custom_id?: string; payments?: { captures?: Capture[] } }[]
}

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
          amount: { currency_code: o.currency, value: o.amount.toFixed(2) },
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
    (l) => l.rel === "payer-action" || l.rel === "approve"
  )?.href
  if (!approve)
    throw new PaypalApiError("PayPal did not return a checkout link.", 502)
  return { orderId: order.id, approveUrl: approve }
}

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
  } catch (e) {
    if (e instanceof PaypalApiError && e.issue === "ORDER_ALREADY_CAPTURED")
      order = await getOrder(connectionId, orderId)
    else throw e
  }
  const unit = order.purchase_units?.[0]
  const capture =
    unit?.payments?.captures?.find((c) => c.status === "COMPLETED") ?? null
  return { customId: unit?.custom_id ?? capture?.custom_id ?? null, capture }
}
