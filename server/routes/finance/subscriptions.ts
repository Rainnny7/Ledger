import { randomUUID } from "node:crypto"
import { z } from "zod"
import { currencyCode, isoDate } from "../../validation.ts"
import { CATEGORIES, type Cycle } from "../../../shared/categories.ts"
import {
  addCycle,
  amountTolerance,
  detectRecurring,
  isCycle,
  monthlyEquivalent,
  nextDue,
} from "../../finance/recurring.ts"
import { db } from "../../db.ts"
import { todayIso } from "../../today.ts"
import { access, canEdit, forgetItem, listWithShared } from "../../sharing.ts"
import { loadTransactions } from "./transactions.ts"
import type { Hono } from "hono"
import type { Vars } from "./types.ts"

interface SubRow {
  id: string
  name: string
  amount: number
  currency: string
  cycle: Cycle
  anchorDate: string
  category: string
  accountId: string | null
  merchantKey: string | null
  notes: string | null
  active: number
  createdAt: string
}

function loadSubscriptions(userId: string, only?: string) {
  const subs = db
    .prepare(
      `SELECT id, name, amount, currency, cycle, anchor_date AS anchorDate, category, account_id AS accountId,
              merchant_key AS merchantKey, notes, active, created_at AS createdAt
         FROM subscription WHERE user_id = ? ${only ? "AND id = ?" : ""} ORDER BY name COLLATE NOCASE`
    )
    .all(...(only ? [userId, only] : [userId])) as unknown as SubRow[]
  const txs = loadTransactions(userId)
  const today = todayIso()

  const sameAmount = (a: number, b: number) =>
    Math.abs(Math.abs(a) - Math.abs(b)) <= amountTolerance(Math.abs(b))

  // Charges counted toward a plan by hand, and which plan each one belongs to.
  const linkRows = db
    .prepare(
      `SELECT sc.subscription_id AS subId, sc.transaction_id AS txId
         FROM subscription_charge sc JOIN subscription s ON s.id = sc.subscription_id
        WHERE s.user_id = ?`
    )
    .all(userId) as { subId: string; txId: string }[]
  const linkedTo = new Map(linkRows.map((r) => [r.txId, r.subId]))
  const txById = new Map(txs.map((t) => [t.id, t]))
  /** What each plan's charges look like: its own merchant and price, plus every charge linked to it. */
  const patternsOf = (s: SubRow) => {
    const out: { merchantKey: string; amount: number }[] = []
    if (s.merchantKey)
      out.push({ merchantKey: s.merchantKey, amount: s.amount })
    for (const r of linkRows) {
      const t = r.subId === s.id ? txById.get(r.txId) : undefined
      if (t) out.push({ merchantKey: t.merchantKey, amount: t.amount })
    }
    return out
  }

  const subscriptions = subs.map((s) => {
    // Charges from the merchant at roughly this plan's price (one merchant can bill several plans),
    // or like one linked to it, plus the linked ones themselves. A charge linked to another plan is
    // that plan's alone.
    const patterns = patternsOf(s)
    const payments = txs
      .filter((t) => {
        const owner = linkedTo.get(t.id)
        if (owner) return owner === s.id
        return (
          t.amount < 0 &&
          !t.fundsPaypal &&
          patterns.some(
            (p) =>
              p.merchantKey === t.merchantKey && sameAmount(t.amount, p.amount)
          )
        )
      })
      .slice(0, 24)
      .map((t) => ({
        id: t.id,
        date: t.date,
        amount: t.amount,
        accountId: t.accountId as string | null,
        pending: t.pending,
        linked: linkedTo.get(t.id) === s.id,
      }))
    const last = payments[0]
    // A charge on/after the anchor proves that cycle was billed; the next one follows it.
    const base =
      last && last.date >= s.anchorDate
        ? addCycle(last.date, s.cycle)
        : s.anchorDate
    return {
      ...s,
      active: Boolean(s.active),
      nextDue: nextDue(base, s.cycle, today),
      monthly: monthlyEquivalent(s.amount, s.cycle),
      lastCharge: last ? { date: last.date, amount: last.amount } : null,
      payments,
    }
  })

  if (only) return { subscriptions, suggestions: [] }

  // Dismissals store a suggestion id ("merchant#amount"); older ones stored the bare merchant key.
  const dismissed = new Set(
    (
      db
        .prepare(
          `SELECT merchant_key AS k FROM subscription_dismissed WHERE user_id = ?`
        )
        .all(userId) as { k: string }[]
    ).map((r) => r.k)
  )
  const guesses = detectRecurring(
    txs.filter((t) => !t.pending),
    today
  )
  const isTracked = (g: (typeof guesses)[number]) =>
    subs.some((s) =>
      patternsOf(s).some(
        (p) =>
          p.merchantKey === g.merchantKey &&
          // With a single guess for the merchant, any tracked plan covers it (its price may have moved).
          (sameAmount(g.amount, p.amount) ||
            guesses.filter((o) => o.merchantKey === g.merchantKey).length === 1)
      )
    )
  const suggestions = guesses
    .filter(
      (g) =>
        !isTracked(g) && !dismissed.has(g.id) && !dismissed.has(g.merchantKey)
    )
    .map((g) => ({
      ...g,
      accountId:
        txs.find(
          (t) =>
            t.merchantKey === g.merchantKey && sameAmount(t.amount, g.amount)
        )?.accountId ?? null,
    }))

  return { subscriptions, suggestions }
}

/** Someone else's subscription as a person it's shared with sees it: without the owner's bank details. */
function sharedSubscription(ownerId: string, id: string) {
  const s = loadSubscriptions(ownerId, id).subscriptions[0]
  return (
    s && {
      ...s,
      accountId: null,
      payments: s.payments.map((p) => ({ ...p, accountId: null })),
    }
  )
}

export function mountSubscriptions(finance: Hono<Vars>) {
  finance.get("/subscriptions", (c) => {
    const userId = c.var.user.id
    const { subscriptions, suggestions } = loadSubscriptions(userId)
    return c.json({
      subscriptions: listWithShared(
        "subscription",
        userId,
        () => subscriptions,
        sharedSubscription
      ),
      suggestions,
    })
  })

  const subBody = z.object({
    name: z.string().trim().min(1).max(80),
    amount: z.number().positive().max(1_000_000),
    currency: currencyCode.default("CAD"),
    cycle: z.string().refine(isCycle, "Unknown billing period"),
    anchorDate: isoDate,
    category: z.enum(CATEGORIES).default("subscriptions"),
    accountId: z.string().nullable().optional(),
    merchantKey: z.string().max(120).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    active: z.boolean().default(true),
  })

  function ownsAccount(userId: string, accountId: string | null | undefined) {
    if (!accountId) return true
    return !!db
      .prepare(
        `SELECT 1 FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id WHERE a.id = ? AND c.user_id = ?`
      )
      .get(accountId, userId)
  }

  finance.post("/subscriptions", async (c) => {
    const body = subBody.safeParse(await c.req.json().catch(() => ({})))
    if (!body.success)
      return c.json({ error: "Check the subscription details." }, 400)
    const d = body.data
    if (!ownsAccount(c.var.user.id, d.accountId))
      return c.json({ error: "Unknown account" }, 400)
    const id = randomUUID()
    db.prepare(
      `INSERT INTO subscription (id, user_id, name, amount, currency, cycle, anchor_date, category, account_id, merchant_key, notes, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      c.var.user.id,
      d.name,
      d.amount,
      d.currency.toUpperCase(),
      d.cycle,
      d.anchorDate,
      d.category,
      d.accountId ?? null,
      d.merchantKey ?? null,
      d.notes?.trim() || null,
      d.active ? 1 : 0
    )
    return c.json({ id })
  })

  finance.patch("/subscriptions/:id", async (c) => {
    const body = subBody
      .partial()
      .safeParse(await c.req.json().catch(() => ({})))
    if (!body.success)
      return c.json({ error: "Check the subscription details." }, 400)
    const d = body.data
    const a = access(c.var.user.id, "subscription", c.req.param("id"))
    if (!a) return c.json({ error: "Not found" }, 404)
    if (!canEdit(a))
      return c.json({ error: "You can only view this subscription." }, 403)
    if (a.role !== "owner") {
      // Which account pays it, and the charges it matches, live in the owner's bank.
      delete d.accountId
      delete d.merchantKey
    }
    if (!ownsAccount(c.var.user.id, d.accountId))
      return c.json({ error: "Unknown account" }, 400)
    const cols: Record<string, string> = {
      name: "name",
      amount: "amount",
      currency: "currency",
      cycle: "cycle",
      anchorDate: "anchor_date",
      category: "category",
      accountId: "account_id",
      merchantKey: "merchant_key",
      notes: "notes",
      active: "active",
    }
    const sets: string[] = []
    const vals: (string | number | null)[] = []
    for (const [k, col] of Object.entries(cols)) {
      const v = (d as Record<string, unknown>)[k]
      if (v === undefined) continue
      sets.push(`${col} = ?`)
      vals.push(
        typeof v === "boolean" ? (v ? 1 : 0) : (v as string | number | null)
      )
    }
    if (sets.length === 0) return c.json({ ok: true })
    const r = db
      .prepare(
        `UPDATE subscription SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
      )
      .run(...vals, c.req.param("id"), a.ownerId)
    return r.changes
      ? c.json({ ok: true })
      : c.json({ error: "Not found" }, 404)
  })

  finance.delete("/subscriptions/:id", (c) => {
    const r = db
      .prepare(`DELETE FROM subscription WHERE id = ? AND user_id = ?`)
      .run(c.req.param("id"), c.var.user.id)
    if (r.changes) forgetItem("subscription", c.req.param("id"))
    return r.changes
      ? c.json({ ok: true })
      : c.json({ error: "Not found" }, 404)
  })

  /** Count a charge toward one of your subscriptions (moving it off any other), or stop counting it. */
  finance.put("/subscriptions/charges/:txId", async (c) => {
    const userId = c.var.user.id
    const body = z
      .object({ subscriptionId: z.string().min(1).nullable() })
      .safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: "Invalid request" }, 400)
    const tx = loadTransactions(userId, { id: c.req.param("txId") })[0]
    if (!tx) return c.json({ error: "Not found" }, 404)
    const { subscriptionId } = body.data
    let sub: { id: string; merchantKey: string | null } | undefined
    if (subscriptionId) {
      sub = db
        .prepare(
          `SELECT id, merchant_key AS merchantKey FROM subscription WHERE id = ? AND user_id = ?`
        )
        .get(subscriptionId, userId) as typeof sub
      if (!sub) return c.json({ error: "Unknown subscription" }, 400)
    }
    db.prepare(
      `DELETE FROM subscription_charge WHERE transaction_id = ?
       AND subscription_id IN (SELECT id FROM subscription WHERE user_id = ?)`
    ).run(tx.id, userId)
    if (sub) {
      db.prepare(
        `INSERT INTO subscription_charge (subscription_id, transaction_id) VALUES (?, ?)`
      ).run(sub.id, tx.id)
      // A plan that wasn't tied to a merchant yet follows this one from now on.
      if (!sub.merchantKey)
        db.prepare(`UPDATE subscription SET merchant_key = ? WHERE id = ?`).run(
          tx.merchantKey,
          sub.id
        )
    }
    return c.json({ ok: true })
  })

  finance.post("/subscriptions/dismiss", async (c) => {
    // `id` is the suggestion id from GET /subscriptions.
    const body = z
      .object({ id: z.string().min(1).max(140) })
      .safeParse(await c.req.json().catch(() => ({})))
    if (!body.success) return c.json({ error: "Invalid request" }, 400)
    db.prepare(
      `INSERT OR IGNORE INTO subscription_dismissed (user_id, merchant_key) VALUES (?, ?)`
    ).run(c.var.user.id, body.data.id)
    return c.json({ ok: true })
  })
}
