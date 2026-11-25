import { randomUUID } from "node:crypto"
import { saveScrape } from "../banks/store.ts"
import type { ScrapedAccount } from "../banks/types.ts"
import { db, getSetting, setSetting } from "../db.ts"
import { merchantKeyOf } from "../finance/categorize.ts"
import { account } from "./accounts.ts"
import { generate } from "./generate.ts"
import { seedGoals } from "./goals.ts"
import {
  DEFAULT_PERSONA,
  emailOf,
  type Persona,
  PERSONAS,
  personaOf,
  userIdOf,
} from "./personas.ts"
import { roundMoney, toCents } from "../../shared/money.ts"
import { iso } from "./util.ts"
import { seedUsdJob, seedWork, usdWallet } from "./work.ts"

const SEED_VERSION = "7"

function ensureDemoUser(p: Persona) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
     VALUES (?, ?, ?, 1, ?, ?, 'user', 1)
     ON CONFLICT (id) DO NOTHING`
  ).run(userIdOf(p), p.name, emailOf(p), now, now)
}

/** Subscriptions for personas that don't have a hand-written list: one per recurring card charge. */
const SUB_NAMES: Record<string, [name: string, category: string]> = {
  NETFLIX: ["Netflix", "subscriptions"],
  SPOTIFY: ["Spotify", "subscriptions"],
  APPLE: ["Apple services", "subscriptions"],
  EQUINOX: ["Equinox", "health"],
  OPENAI: ["ChatGPT Plus", "subscriptions"],
}

function seed(today: Date, p: Persona) {
  const userId = userIdOf(p)
  const { chequing, savings, visa, paypal } = generate(today, p)
  db.prepare(`DELETE FROM bank_connection WHERE user_id = ?`).run(userId)
  db.prepare(`DELETE FROM subscription WHERE user_id = ?`).run(userId)
  db.prepare(`DELETE FROM subscription_dismissed WHERE user_id = ?`).run(userId)
  db.prepare(`DELETE FROM advice_dismissed WHERE user_id = ?`).run(userId)
  db.prepare(`DELETE FROM category_rule WHERE user_id = ?`).run(userId)
  db.prepare(`DELETE FROM budget WHERE user_id = ?`).run(userId)
  const budget = db.prepare(
    `INSERT INTO budget (user_id, category, amount, currency) VALUES (?, ?, ?, ?)`
  )
  for (const [category, amount] of p.budgets)
    budget.run(userId, category, toCents(amount), p.currency)
  db.prepare(`DELETE FROM goal WHERE user_id = ?`).run(userId) // payments cascade
  db.prepare(`DELETE FROM work_job WHERE user_id = ?`).run(userId) // bills, shifts, payments cascade

  const inCurrency = (a: ScrapedAccount): ScrapedAccount => ({
    ...a,
    currency: a.currency === "CAD" ? p.currency : a.currency,
  })
  saveScrape({
    userId,
    connectionId: null,
    institution: "td",
    label: p.id === "musk" ? "TD Private Banking" : "TD EasyWeb",
    usernameMasked: "•••• 2291",
    credentialsEnc: null,
    browserStateEnc: null,
    accounts: [
      account(
        "demo:chq",
        p.accounts.chequing,
        "chequing",
        "•••4417",
        p.opening.chequing,
        chequing,
        (b) => ({
          overdraftLimit: p.overdraft,
          overdraftUsed: 0,
          available: roundMoney(b + p.overdraft),
        })
      ),
      account(
        "demo:sav",
        p.accounts.savings,
        "savings",
        "•••6243",
        p.opening.savings,
        savings
      ),
      account(
        "demo:visa",
        p.accounts.visa,
        "credit",
        "•••8830",
        p.opening.visa,
        visa,
        (b) => ({
          creditLimit: p.creditLimit,
          available: roundMoney(p.creditLimit + b),
        })
      ),
      // Even a billionaire's money mostly sits in holdings rather than in a bank account.
      ...(p.id === "musk"
        ? [
            account(
              "demo:inv",
              "Holdings (TSLA, SpaceX, xAI)",
              "investment",
              "•••0001",
              240_000_000_000,
              []
            ),
          ]
        : []),
    ].map(inCurrency),
  })
  if (p.extras)
    saveScrape({
      userId,
      connectionId: null,
      institution: "paypal",
      label: "PayPal",
      usernameMasked: "API app",
      credentialsEnc: null,
      browserStateEnc: null,
      accounts: [
        account("paypal:CAD", "PayPal balance", "wallet", null, 80.18, paypal),
        // US client payments land here (see seedWork); one was moved out and converted to CAD.
        account(
          "paypal:USD",
          "PayPal balance (USD)",
          "wallet",
          null,
          0,
          usdWallet(today),
          () => ({ currency: "USD" })
        ),
      ],
    })

  const visaId = (
    db
      .prepare(
        `SELECT a.id FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id WHERE c.user_id = ? AND a.external_key = 'demo:visa'`
      )
      .get(userId) as { id: string }
  ).id
  const anchor = (dom: number) =>
    iso(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, dom))
    )
  const subs: [
    name: string,
    amount: number,
    currency: string,
    cycle: string,
    anchor: string,
    category: string,
    merchant: string | null,
    account: string | null,
  ][] = [
    [
      "Netflix",
      18.99,
      "CAD",
      "monthly",
      anchor(4),
      "subscriptions",
      "Netflix",
      visaId,
    ],
    [
      "Spotify",
      11.99,
      "CAD",
      "monthly",
      anchor(9),
      "subscriptions",
      "Spotify",
      visaId,
    ],
    [
      "GoodLife Fitness",
      54.99,
      "CAD",
      "monthly",
      anchor(22),
      "health",
      "Goodlife Fitness",
      visaId,
    ],
    [
      "Rogers Wireless",
      85.4,
      "CAD",
      "monthly",
      anchor(8),
      "bills",
      "Rogers",
      null,
    ],
    [
      "ChatGPT Plus",
      20,
      "USD",
      "monthly",
      anchor(26),
      "subscriptions",
      "OpenAI ChatGPT Subscr",
      visaId,
    ],
    [
      "GitHub Copilot",
      100,
      "USD",
      "yearly",
      iso(
        new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 4, 11))
      ),
      "subscriptions",
      null,
      null,
    ],
    [
      "Proton Mail",
      47.88,
      "EUR",
      "yearly",
      iso(
        new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 9, 3))
      ),
      "subscriptions",
      null,
      null,
    ],
    [
      "Domain renewal",
      64,
      "CAD",
      "every-4-years",
      iso(new Date(Date.UTC(today.getUTCFullYear() - 2, 2, 17))),
      "subscriptions",
      null,
      null,
    ],
    [
      "Antivirus",
      89.99,
      "CAD",
      "biennial",
      iso(new Date(Date.UTC(today.getUTCFullYear() - 1, 9, 2))),
      "subscriptions",
      null,
      null,
    ],
  ]
  if (!p.extras) {
    subs.length = 0
    for (const [dom, description, amount] of p.cardSubs) {
      const [name, category] = SUB_NAMES[description.split(/[ .*]/)[0]] ?? [
        description,
        "subscriptions",
      ]
      subs.push([
        name,
        amount,
        p.currency,
        "monthly",
        anchor(dom),
        category,
        name,
        visaId,
      ])
    }
  }
  const insert = db.prepare(
    `INSERT INTO subscription (id, user_id, name, amount, currency, cycle, anchor_date, category, account_id, merchant_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const [
    name,
    amount,
    currency,
    cycle,
    anchorDate,
    category,
    merchant,
    accountId,
  ] of subs) {
    insert.run(
      randomUUID(),
      userId,
      name,
      toCents(amount),
      currency,
      cycle,
      anchorDate,
      category,
      accountId,
      merchant ? merchantKeyOf(merchant) : null
    )
  }

  seedGoals(today, p, userId)
  if (p.extras) {
    seedWork(today, userId)
    seedUsdJob(today, userId)
  }
}

/** Make sure today's data exists for a demo persona. Cheap after the first call of the day. */
export function ensureDemoData(personaId?: string | null) {
  const p = personaOf(personaId)
  const today = new Date()
  const stamp = `${SEED_VERSION}:${iso(today)}`
  const key = p.id === DEFAULT_PERSONA ? "demo_seeded" : `demo_seeded:${p.id}`
  if (
    getSetting(key) === stamp &&
    db.prepare(`SELECT 1 FROM user WHERE id = ?`).get(userIdOf(p))
  )
    return
  ensureDemoUser(p)
  seed(today, p)
  setSetting(key, stamp)
}

/** Throw away every demo user's data (and anything changed since) and generate it again. */
export function reseedDemoData() {
  const today = new Date()
  for (const p of Object.values(PERSONAS)) {
    ensureDemoUser(p)
    seed(today, p)
    setSetting(
      p.id === DEFAULT_PERSONA ? "demo_seeded" : `demo_seeded:${p.id}`,
      `${SEED_VERSION}:${iso(today)}`
    )
  }
}
