import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../../auth/index.ts"
import {
  createOrder,
  captureOrder,
  PaypalApiError,
} from "../../banks/paypal/api.ts"
import { recordCapture } from "../../banks/paypal/webhooks.ts"
import { db } from "../../db.ts"
import { env } from "../../env.ts"
import {
  type InvoiceView,
  loadByToken,
  loadPaymentMethods,
  type PaymentMethod,
} from "../../finance/invoice-store.ts"

// ---------------------------------------------------------------- public (share link, no sign-in)

export const publicInvoices = new Hono()

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
  const byId = new Map(methods.map((m) => [m.id, m]))
  const offered = methodIds
    .map((id) => byId.get(id))
    .filter((m): m is PaymentMethod => !!m)
    // The PayPal checkout needs a live connection; its id stays private.
    .filter(
      (m) => m.kind !== "paypal-checkout" || hasPaypal(m.fields.connectionId)
    )
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      label: m.label,
      fields: m.kind === "paypal-checkout" ? {} : m.fields,
    }))
  return { ...rest, methods: offered }
}

const hasPaypal = (connectionId: string | undefined) =>
  !!connectionId &&
  !!db
    .prepare(
      `SELECT 1 FROM bank_connection WHERE id = ? AND institution = 'paypal' AND credentials_enc IS NOT NULL`
    )
    .get(connectionId)

function checkoutConnection(userId: string, invoice: InvoiceView) {
  const onInvoice = new Set(invoice.methodIds)
  const method = loadPaymentMethods(userId).find(
    (m) => m.kind === "paypal-checkout" && onInvoice.has(m.id)
  )
  const id = method?.fields.connectionId
  const owned =
    id &&
    db
      .prepare(
        `SELECT 1 FROM bank_connection WHERE id = ? AND user_id = ? AND institution = 'paypal'`
      )
      .get(id, userId)
  return owned ? id : null
}

publicInvoices.get("/invoices/:token", async (c) => {
  const found = loadByToken(c.req.param("token"))
  if (!found)
    return c.json({ error: "This invoice link is not valid any more." }, 404)
  // Note the first time someone other than you opens it.
  if (!found.invoice.viewedAt) {
    const session = await auth.api
      .getSession({ headers: c.req.raw.headers })
      .catch(() => null)
    if (session?.user.id !== found.userId)
      db.prepare(
        `UPDATE invoice SET viewed_at = datetime('now') WHERE id = ?`
      ).run(found.invoice.id)
  }
  c.header("Cache-Control", "no-store")
  c.header("X-Robots-Tag", "noindex")
  return c.json({
    invoice: publicView(found.invoice, loadPaymentMethods(found.userId)),
  })
})

/** A few checkout attempts per link per minute is plenty for a person. */
const attempts = new Map<string, number[]>()
function limited(key: string) {
  const now = Date.now()
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  attempts.set(key, recent)
  // Drop only idle entries; clearing everything would let a burst of requests reset every link's count.
  if (attempts.size > 5000)
    for (const [k, times] of attempts)
      if (times.every((t) => now - t >= 60_000)) attempts.delete(k)
  return recent.length > 10
}

publicInvoices.post("/invoices/:token/paypal", async (c) => {
  const token = c.req.param("token")
  // Only real links are counted, so made-up tokens can't fill the table.
  const found = loadByToken(token)
  if (!found)
    return c.json({ error: "This invoice link is not valid any more." }, 404)
  if (limited(token))
    return c.json(
      { error: "Too many attempts. Wait a minute and try again." },
      429
    )
  const { invoice, userId } = found
  if (invoice.status === "void")
    return c.json({ error: "This invoice was cancelled." }, 400)
  if (invoice.balance <= 0)
    return c.json({ error: "This invoice is already paid." }, 400)
  const connectionId = checkoutConnection(userId, invoice)
  if (!connectionId)
    return c.json(
      { error: "Paying by PayPal is not available on this invoice." },
      400
    )
  const page = `${env.publicUrl}/i/${encodeURIComponent(token)}`
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
    return c.json({ url: approveUrl })
  } catch (e) {
    console.error("PayPal order failed", e)
    return c.json(
      {
        error:
          e instanceof PaypalApiError
            ? `PayPal: ${e.message}`
            : "Could not start the PayPal checkout.",
      },
      502
    )
  }
})

/** The payer is back from PayPal (`?token=<order id>`): take the payment. */
publicInvoices.post("/invoices/:token/paypal/capture", async (c) => {
  const token = c.req.param("token")
  const body = z
    .object({ orderId: z.string().regex(/^[A-Z0-9]{5,40}$/) })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Invalid request" }, 400)
  const found = loadByToken(token)
  if (!found)
    return c.json({ error: "This invoice link is not valid any more." }, 404)
  if (limited(token))
    return c.json(
      { error: "Too many attempts. Wait a minute and try again." },
      429
    )
  const connectionId = checkoutConnection(found.userId, found.invoice)
  if (!connectionId)
    return c.json(
      { error: "Paying by PayPal is not available on this invoice." },
      400
    )
  try {
    const { capture, customId } = await captureOrder(
      connectionId,
      body.data.orderId
    )
    // Only an order made for this very invoice counts toward it.
    if (!capture || customId !== found.invoice.id)
      return c.json({ error: "That PayPal payment did not go through." }, 400)
    recordCapture({ id: connectionId, userId: found.userId }, capture, customId)
  } catch (e) {
    console.error("PayPal capture failed", e)
    return c.json(
      {
        error:
          e instanceof PaypalApiError
            ? `PayPal: ${e.message}`
            : "Could not finish the PayPal payment.",
      },
      502
    )
  }
  const fresh = loadByToken(token)
  return c.json({
    invoice: fresh
      ? publicView(fresh.invoice, loadPaymentMethods(found.userId))
      : null,
  })
})
