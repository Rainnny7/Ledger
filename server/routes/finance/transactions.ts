import { z } from "zod"
import { classify } from "../../finance/categorize.ts"
import { CATEGORIES, isCategory } from "../../../shared/categories.ts"
import { isTaxTag, TAX_TAGS, type TaxTag } from "../../../shared/categories.ts"
import { db } from "../../db.ts"
import { orderWithinDays } from "../../finance/order.ts"
import type { Hono } from "hono"
import type { EnrichedTx, TxRow } from "./types.ts"
import { PAYPAL_CHARGE } from "./types.ts"
import type { Vars } from "./types.ts"

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

export function mountTransactions(finance: Hono<Vars>) {
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
}
