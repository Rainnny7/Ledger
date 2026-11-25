import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { z } from "zod"
import { currencyCode, isoDate } from "../validation.ts"
import type { auth } from "../auth.ts"
import { db } from "../db.ts"
import { todayIso } from "../today.ts"
import {
  addCycle,
  amountTolerance,
  CATEGORIES,
  type Category,
  classify,
  type Cycle,
  detectRecurring,
  isCategory,
  isCycle,
  monthlyEquivalent,
  nextDue,
} from "../finance/categorize.ts"
import { getRates } from "../fx.ts"
import { isTaxTag, TAX_TAGS, type TaxTag } from "../../shared/categories.ts"
import {
  access,
  canEdit,
  forgetItem,
  listWithShared,
  viewOne,
} from "../sharing.ts"
import { orderWithinDays } from "../finance/order.ts"
import {
  GOAL_KINDS,
  type GoalPaymentRow,
  type GoalRow,
  summarizeGoal,
} from "../finance/goals.ts"

type Vars = { Variables: { user: typeof auth.$Infer.Session.user } }
export const finance = new Hono<Vars>()

// ---------------------------------------------------------------- exchange rates

/** Daily reference rates, for showing mixed-currency totals in your own currency. */
finance.get("/fx", async (c) => c.json(await getRates()))

/** Monthly spending limits per category. */
finance.get("/budgets", (c) => {
  const budgets = db
    .prepare(
      `SELECT category, amount, currency, updated_at AS updatedAt FROM budget WHERE user_id = ? ORDER BY category`
    )
    .all(c.var.user.id)
  return c.json({ budgets })
})

finance.put("/budgets/:category", async (c) => {
  const category = z.enum(CATEGORIES).safeParse(c.req.param("category"))
  const body = z
    .object({ amount: z.number().positive().max(1e9), currency: currencyCode })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!category.success || !body.success)
    return c.json({ error: "Invalid budget" }, 400)
  db.prepare(
    `INSERT INTO budget (user_id, category, amount, currency) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, category) DO UPDATE SET amount = excluded.amount, currency = excluded.currency, updated_at = datetime('now')`
  ).run(
    c.var.user.id,
    category.data,
    Math.round(body.data.amount * 100) / 100,
    body.data.currency
  )
  return c.json({ ok: true })
})

finance.delete("/budgets/:category", (c) => {
  db.prepare(`DELETE FROM budget WHERE user_id = ? AND category = ?`).run(
    c.var.user.id,
    c.req.param("category")
  )
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- transactions

interface TxRow {
  id: string
  accountId: string
  date: string
  description: string
  amount: number
  runningBalance: number | null
  pending: number
  categoryOverride: string | null
  taxTagRaw: string | null
  note: string | null
  createdAt: string
  institution: string
}

export interface EnrichedTx extends Omit<
  TxRow,
  "pending" | "categoryOverride" | "taxTagRaw" | "institution"
> {
  pending: boolean
  merchant: string
  merchantKey: string
  category: Category
  categorySource: "auto" | "rule" | "manual"
  /** Business or personal for the tax report; null while untagged. */
  taxTag: TaxTag | null
  /** manual: set on this transaction · rule: the merchant's rule · auto: a payment for one of your bills or invoices. */
  taxTagSource: "auto" | "rule" | "manual" | null
  /**
   * A bank/card charge that topped up a connected PayPal account. The purchase itself shows on the
   * PayPal side under the real merchant, so this one counts as a transfer and never as a payment.
   */
  fundsPaypal?: boolean
}

/** How PayPal shows up on bank and card statements. */
const PAYPAL_CHARGE = /paypal|^pp\*/i

function rulesFor(userId: string) {
  const rows = db
    .prepare(
      `SELECT merchant_key AS k, category AS c FROM category_rule WHERE user_id = ?`
    )
    .all(userId) as {
    k: string
    c: string
  }[]
  return new Map(rows.map((r) => [r.k, r.c]))
}

function taxRulesFor(userId: string) {
  const rows = db
    .prepare(
      `SELECT merchant_key AS k, tag AS t FROM tax_rule WHERE user_id = ?`
    )
    .all(userId) as { k: string; t: string }[]
  return new Map(rows.map((r) => [r.k, r.t]))
}

/** Transactions recorded as a payment for one of your Work bills or invoices: business income. */
function paidBillTransactions(userId: string) {
  const rows = db
    .prepare(
      `SELECT p.transaction_id AS id FROM work_payment p
         JOIN work_invoice i ON i.id = p.invoice_id JOIN work_job j ON j.id = i.job_id
        WHERE j.user_id = ? AND p.transaction_id IS NOT NULL
       UNION
       SELECT p.transaction_id FROM invoice_payment p JOIN invoice i ON i.id = p.invoice_id
        WHERE i.user_id = ? AND p.transaction_id IS NOT NULL`
    )
    .all(userId, userId) as { id: string }[]
  return new Set(rows.map((r) => r.id))
}

/** Every transaction the user owns (optionally one account), with merchant + category resolved. */
export function loadTransactions(
  userId: string,
  opts: { accountId?: string; from?: string; id?: string } = {}
): EnrichedTx[] {
  const where = ["c.user_id = ?"]
  const args: string[] = [userId]
  if (opts.id) {
    where.push("t.id = ?")
    args.push(opts.id)
  }
  if (opts.accountId) {
    where.push("t.account_id = ?")
    args.push(opts.accountId)
  }
  if (opts.from) {
    where.push("t.date >= ?")
    args.push(opts.from)
  }
  const rows = db
    .prepare(
      `SELECT t.id, t.account_id AS accountId, t.date, t.description, t.amount, t.running_balance AS runningBalance,
              t.pending, t.category_override AS categoryOverride, t.tax_tag AS taxTagRaw, t.note, t.created_at AS createdAt, c.institution
         FROM bank_transaction t
         JOIN bank_account a ON a.id = t.account_id
         JOIN bank_connection c ON c.id = a.connection_id
        WHERE ${where.join(" AND ")}
        ORDER BY t.date DESC, t.created_at DESC, t.rowid ASC
        LIMIT 50000`
    )
    .all(...args) as unknown as TxRow[]
  // Within a day: rows from a newer sync first, then each account's running balances settle the rest.
  const ordered = orderWithinDays(rows)

  const rules = rulesFor(userId)
  const taxRules = taxRulesFor(userId)
  const billPayments = paidBillTransactions(userId)
  const hasPaypal = Boolean(
    db
      .prepare(
        `SELECT 1 FROM bank_connection WHERE user_id = ? AND institution = 'paypal' LIMIT 1`
      )
      .get(userId)
  )
  return ordered.map(
    ({ categoryOverride, taxTagRaw, pending, institution, ...t }) => {
      const auto = classify(t.description, t.amount)
      const rule = rules.get(auto.merchantKey)
      let category = auto.category
      let categorySource: EnrichedTx["categorySource"] = "auto"
      if (isCategory(categoryOverride)) {
        category = categoryOverride
        categorySource = "manual"
      } else if (isCategory(rule)) {
        category = rule
        categorySource = "rule"
      }
      const fundsPaypal =
        hasPaypal &&
        institution !== "paypal" &&
        t.amount < 0 &&
        categorySource !== "manual" &&
        PAYPAL_CHARGE.test(t.description.trim())
      if (fundsPaypal) {
        category = "transfers"
        categorySource = "auto"
      }
      const taxRule = taxRules.get(auto.merchantKey)
      let taxTag: TaxTag | null = null
      let taxTagSource: EnrichedTx["taxTagSource"] = null
      if (isTaxTag(taxTagRaw)) {
        taxTag = taxTagRaw
        taxTagSource = "manual"
      } else if (isTaxTag(taxRule)) {
        taxTag = taxRule
        taxTagSource = "rule"
      } else if (billPayments.has(t.id)) {
        taxTag = "business"
        taxTagSource = "auto"
      }
      return {
        ...t,
        pending: Boolean(pending),
        merchant: auto.merchant,
        merchantKey: auto.merchantKey,
        category,
        categorySource,
        taxTag,
        taxTagSource,
        ...(fundsPaypal ? { fundsPaypal } : {}),
      }
    }
  )
}

finance.get("/transactions", (c) => {
  const from = c.req.query("from")
  return c.json({
    transactions: loadTransactions(c.var.user.id, {
      from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
    }),
    categories: CATEGORIES,
  })
})

const patchTx = z.object({
  /** null resets to the automatic category. */
  category: z.enum(CATEGORIES).nullable().optional(),
  /** Also file every transaction from this merchant under the category (now and in future syncs). */
  applyToMerchant: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
  /** Business / personal for the tax report; null clears it. */
  taxTag: z.enum(TAX_TAGS).nullable().optional(),
  /** Also tag every transaction from this merchant the same way (now and in future syncs). */
  applyTaxToMerchant: z.boolean().optional(),
})

/** Files several transactions under one category, or tags them for taxes (null resets either). */
finance.patch("/transactions/bulk", async (c) => {
  const body = z
    .object({
      ids: z.array(z.string().min(1).max(80)).min(1).max(5000),
      category: z.enum(CATEGORIES).nullable().optional(),
      taxTag: z.enum(TAX_TAGS).nullable().optional(),
    })
    .refine(
      (b) => (b.category !== undefined) !== (b.taxTag !== undefined),
      "Send a category or a tax tag"
    )
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Invalid request" }, 400)
  const column =
    body.data.category !== undefined ? "category_override" : "tax_tag"
  const value =
    body.data.category !== undefined
      ? body.data.category
      : (body.data.taxTag ?? null)
  const update = db.prepare(
    `UPDATE bank_transaction SET ${column} = ?
      WHERE id = ? AND account_id IN (SELECT a.id FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id WHERE c.user_id = ?)`
  )
  let updated = 0
  db.exec("BEGIN")
  try {
    for (const id of new Set(body.data.ids))
      updated += Number(update.run(value, id, c.var.user.id).changes)
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
  return c.json({ updated })
})

finance.patch("/transactions/:id", async (c) => {
  const body = patchTx.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Invalid request" }, 400)
  const userId = c.var.user.id
  const tx = db
    .prepare(
      `SELECT t.id, t.description, t.amount FROM bank_transaction t
         JOIN bank_account a ON a.id = t.account_id JOIN bank_connection c ON c.id = a.connection_id
        WHERE t.id = ? AND c.user_id = ?`
    )
    .get(c.req.param("id"), userId) as
    | { id: string; description: string; amount: number }
    | undefined
  if (!tx) return c.json({ error: "Not found" }, 404)

  const { category, applyToMerchant, note, taxTag, applyTaxToMerchant } =
    body.data
  if (note !== undefined)
    db.prepare(`UPDATE bank_transaction SET note = ? WHERE id = ?`).run(
      note?.trim() || null,
      tx.id
    )
  if (taxTag !== undefined) {
    if (applyTaxToMerchant) {
      // Like categories: the rule carries the choice, so this merchant's own tags make way for it.
      const key = classify(tx.description, tx.amount).merchantKey
      if (taxTag === null)
        db.prepare(
          `DELETE FROM tax_rule WHERE user_id = ? AND merchant_key = ?`
        ).run(userId, key)
      else
        db.prepare(
          `INSERT INTO tax_rule (user_id, merchant_key, tag) VALUES (?, ?, ?)
           ON CONFLICT (user_id, merchant_key) DO UPDATE SET tag = excluded.tag`
        ).run(userId, key, taxTag)
      const ids = loadTransactions(userId)
        .filter((t) => t.merchantKey === key && t.taxTagSource === "manual")
        .map((t) => t.id)
      const clear = db.prepare(
        `UPDATE bank_transaction SET tax_tag = NULL WHERE id = ?`
      )
      db.exec("BEGIN")
      try {
        for (const id of ids) clear.run(id)
        db.exec("COMMIT")
      } catch (e) {
        db.exec("ROLLBACK")
        throw e
      }
    } else {
      db.prepare(`UPDATE bank_transaction SET tax_tag = ? WHERE id = ?`).run(
        taxTag,
        tx.id
      )
    }
  }
  if (category !== undefined) {
    const key = classify(tx.description, tx.amount).merchantKey
    if (applyToMerchant) {
      // The rule carries the choice; drop per-transaction overrides for that merchant so they follow it.
      if (category === null)
        db.prepare(
          `DELETE FROM category_rule WHERE user_id = ? AND merchant_key = ?`
        ).run(userId, key)
      else
        db.prepare(
          `INSERT INTO category_rule (user_id, merchant_key, category) VALUES (?, ?, ?)
           ON CONFLICT (user_id, merchant_key) DO UPDATE SET category = excluded.category`
        ).run(userId, key, category)
      const ids = loadTransactions(userId)
        .filter((t) => t.merchantKey === key)
        .map((t) => t.id)
      const clear = db.prepare(
        `UPDATE bank_transaction SET category_override = NULL WHERE id = ? AND category_override IS NOT NULL`
      )
      db.exec("BEGIN")
      try {
        for (const id of ids) clear.run(id)
        db.exec("COMMIT")
      } catch (e) {
        db.exec("ROLLBACK")
        throw e
      }
    } else {
      db.prepare(
        `UPDATE bank_transaction SET category_override = ? WHERE id = ?`
      ).run(category, tx.id)
    }
  }
  const [updated] = loadTransactions(userId, { id: tx.id })
  return c.json({ transaction: updated })
})

// ---------------------------------------------------------------- subscriptions

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
  const body = subBody.partial().safeParse(await c.req.json().catch(() => ({})))
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
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

finance.delete("/subscriptions/:id", (c) => {
  const r = db
    .prepare(`DELETE FROM subscription WHERE id = ? AND user_id = ?`)
    .run(c.req.param("id"), c.var.user.id)
  if (r.changes) forgetItem("subscription", c.req.param("id"))
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
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

// ---------------------------------------------------------------- goals

const GOAL_COLS = `id, name, kind, target, currency, target_date AS targetDate, icon, color, notes, archived, created_at AS createdAt`

function loadGoals(userId: string, id?: string) {
  const goals = (id
    ? db
        .prepare(`SELECT ${GOAL_COLS} FROM goal WHERE user_id = ? AND id = ?`)
        .all(userId, id)
    : db
        .prepare(
          `SELECT ${GOAL_COLS} FROM goal WHERE user_id = ? ORDER BY created_at`
        )
        .all(userId)) as unknown as (Omit<GoalRow, "archived"> & {
    archived: number
  })[]
  if (goals.length === 0) return []
  const payments = db
    .prepare(
      `SELECT p.id, p.goal_id AS goalId, p.amount, p.date, p.note, p.transaction_id AS transactionId, p.created_at AS createdAt
         FROM goal_payment p JOIN goal g ON g.id = p.goal_id WHERE g.user_id = ?`
    )
    .all(userId) as unknown as GoalPaymentRow[]
  const today = todayIso()
  return goals.map((g) =>
    summarizeGoal(
      { ...g, archived: Boolean(g.archived) },
      payments.filter((p) => p.goalId === g.id),
      today
    )
  )
}

const goalFor = (ownerId: string, id: string) => loadGoals(ownerId, id)[0]
const viewGoal = (userId: string, id: string) =>
  viewOne("goal", userId, id, goalFor)

finance.get("/goals", (c) =>
  c.json({
    goals: listWithShared("goal", c.var.user.id, (o) => loadGoals(o), goalFor),
  })
)

const goalBody = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(GOAL_KINDS).default("save"),
  target: z.number().positive().max(100_000_000),
  currency: currencyCode.default("CAD"),
  targetDate: isoDate.nullable().optional(),
  icon: z
    .string()
    .regex(/^[a-z-]{1,32}$/)
    .default("target"),
  color: z
    .string()
    .regex(/^[a-z-]{1,32}$/)
    .default("sunset"),
  notes: z.string().max(500).nullable().optional(),
  archived: z.boolean().default(false),
  /** Money already put aside when the goal is created; logged as the first payment. */
  startingAmount: z.number().min(0).max(100_000_000).optional(),
})

finance.post("/goals", async (c) => {
  const body = goalBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the goal details." }, 400)
  const d = body.data
  const id = randomUUID()
  db.prepare(
    `INSERT INTO goal (id, user_id, name, kind, target, currency, target_date, icon, color, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    c.var.user.id,
    d.name,
    d.kind,
    d.target,
    d.currency.toUpperCase(),
    d.targetDate ?? null,
    d.icon,
    d.color,
    d.notes?.trim() || null,
    d.archived ? 1 : 0
  )
  if (d.startingAmount && d.startingAmount > 0) {
    db.prepare(
      `INSERT INTO goal_payment (id, goal_id, amount, date, note) VALUES (?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      id,
      d.startingAmount,
      todayIso(),
      d.kind === "payoff" ? "Already paid" : "Already saved"
    )
  }
  return c.json({ goal: viewGoal(c.var.user.id, id) })
})

finance.patch("/goals/:id", async (c) => {
  const body = goalBody
    .omit({ startingAmount: true })
    .partial()
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the goal details." }, 400)
  const a = access(c.var.user.id, "goal", c.req.param("id"))
  if (!a) return c.json({ error: "Not found" }, 404)
  if (!canEdit(a)) return c.json({ error: "You can only view this goal." }, 403)
  // Archiving hides it for everyone, so that's the owner's call.
  if (a.role !== "owner") delete body.data.archived
  const cols: Record<string, string> = {
    name: "name",
    kind: "kind",
    target: "target",
    currency: "currency",
    targetDate: "target_date",
    icon: "icon",
    color: "color",
    notes: "notes",
    archived: "archived",
  }
  const sets: string[] = []
  const vals: (string | number | null)[] = []
  for (const [k, col] of Object.entries(cols)) {
    const v = (body.data as Record<string, unknown>)[k]
    if (v === undefined) continue
    sets.push(`${col} = ?`)
    vals.push(
      typeof v === "boolean"
        ? v
          ? 1
          : 0
        : k === "notes"
          ? (v as string | null)?.trim() || null
          : (v as string | number | null)
    )
  }
  if (sets.length) {
    db.prepare(
      `UPDATE goal SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
    ).run(...vals, c.req.param("id"), a.ownerId)
  }
  const goal = viewGoal(c.var.user.id, c.req.param("id"))
  return goal ? c.json({ goal }) : c.json({ error: "Not found" }, 404)
})

finance.delete("/goals/:id", (c) => {
  const r = db
    .prepare(`DELETE FROM goal WHERE id = ? AND user_id = ?`)
    .run(c.req.param("id"), c.var.user.id)
  if (r.changes) forgetItem("goal", c.req.param("id"))
  return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404)
})

const paymentBody = z.object({
  /** Positive toward the goal; negative to take money back out. */
  amount: z
    .number()
    .refine((n) => n !== 0, "Amount can’t be zero")
    .refine((n) => Math.abs(n) <= 100_000_000),
  date: isoDate,
  note: z.string().max(200).nullable().optional(),
  /** Optionally the bank transaction this payment was (e.g. the transfer to savings). */
  transactionId: z.string().max(80).nullable().optional(),
})

/** Owners and people it's shared with for editing can log payments. */
const canEditGoal = (userId: string, goalId: string) =>
  canEdit(access(userId, "goal", goalId))

finance.post("/goals/:id/payments", async (c) => {
  const body = paymentBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Check the payment details." }, 400)
  const userId = c.var.user.id
  const goalId = c.req.param("id")
  if (!canEditGoal(userId, goalId)) return c.json({ error: "Not found" }, 404)
  const d = body.data
  if (
    d.transactionId &&
    loadTransactions(userId, { id: d.transactionId }).length === 0
  )
    return c.json({ error: "Unknown transaction" }, 400)
  db.prepare(
    `INSERT INTO goal_payment (id, goal_id, amount, date, note, transaction_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    goalId,
    Math.round(d.amount * 100) / 100,
    d.date,
    d.note?.trim() || null,
    d.transactionId ?? null
  )
  return c.json({ goal: viewGoal(userId, goalId) })
})

finance.delete("/goals/:id/payments/:pid", (c) => {
  const userId = c.var.user.id
  const goalId = c.req.param("id")
  if (!canEditGoal(userId, goalId)) return c.json({ error: "Not found" }, 404)
  const r = db
    .prepare(`DELETE FROM goal_payment WHERE id = ? AND goal_id = ?`)
    .run(c.req.param("pid"), goalId)
  return r.changes
    ? c.json({ goal: viewGoal(userId, goalId) })
    : c.json({ error: "Not found" }, 404)
})

// ---------------------------------------------------------------- advisor

/** Tips the user hid. Snoozed ones come back once their date passes. */
finance.get("/advice/dismissed", (c) => {
  const rows = db
    .prepare(
      `SELECT tip_id AS id, until FROM advice_dismissed WHERE user_id = ? AND (until IS NULL OR until > ?)`
    )
    .all(c.var.user.id, todayIso()) as { id: string; until: string | null }[]
  return c.json({ dismissed: rows })
})

finance.post("/advice/dismiss", async (c) => {
  // `days` snoozes the tip; without it the tip stays hidden for good.
  const body = z
    .object({
      id: z.string().min(1).max(300),
      days: z.number().int().min(1).max(366).optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) return c.json({ error: "Invalid request" }, 400)
  let until: string | null = null
  if (body.data.days) {
    const d = new Date()
    d.setDate(d.getDate() + body.data.days)
    until = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
  db.prepare(
    `INSERT INTO advice_dismissed (user_id, tip_id, until) VALUES (?, ?, ?)
     ON CONFLICT (user_id, tip_id) DO UPDATE SET until = excluded.until, created_at = datetime('now')`
  ).run(c.var.user.id, body.data.id, until)
  return c.json({ ok: true })
})

/** Brings one hidden tip back (`?id=`), or all of them. */
finance.delete("/advice/dismissed", (c) => {
  const id = c.req.query("id")
  if (id)
    db.prepare(
      `DELETE FROM advice_dismissed WHERE user_id = ? AND tip_id = ?`
    ).run(c.var.user.id, id)
  else
    db.prepare(`DELETE FROM advice_dismissed WHERE user_id = ?`).run(
      c.var.user.id
    )
  return c.json({ ok: true })
})
