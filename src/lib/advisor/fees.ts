import type { Transaction } from "../api"
import { addDays, parseIso } from "../format"
import type { Tip, Ctx } from "./types"
import { r0, money, about, plural, link, merchantsOf } from "./helpers"

const FEE_KINDS: {
  key: string
  re: RegExp
  title: string
  advice: string
  priority: number
}[] = [
  {
    key: "overdraft",
    re: /\bnsf\b|overdraft|\bod\b|insufficient/i,
    title: "Overdraft and NSF charges",
    advice:
      "A small buffer in chequing, or a low-balance alert from your bank, usually stops these entirely.",
    priority: 290,
  },
  {
    key: "interest",
    re: /interest/i,
    title: "You’re paying interest",
    advice:
      "Card interest usually runs 20% or more. Paying the full statement balance each month, or moving the balance to a lower-rate option, makes it go away.",
    priority: 285,
  },
  {
    key: "foreign",
    re: /foreign|\bfx\b|conversion|intl|international|cross.?border/i,
    title: "Foreign transaction fees",
    advice:
      "A card with no foreign transaction fee would avoid the usual 2.5% on purchases in other currencies.",
    priority: 200,
  },
  {
    key: "atm",
    re: /\batm\b|\babm\b|withdrawal fee|network fee|interac fee/i,
    title: "ATM fees",
    advice:
      "Sticking to your own bank’s machines, or getting cash back at the till, avoids these.",
    priority: 190,
  },
  {
    key: "account",
    re: /plan fee|monthly fee|account fee|service charge|maintenance|monthly plan|annual fee/i,
    title: "Account and card fees",
    advice:
      "Many banks waive the monthly fee above a minimum balance, and there are good no-fee accounts and cards. A quick call asking for it to be waived works more often than you’d think.",
    priority: 220,
  },
]

export function feesOf(ctx: Ctx): { tips: Tip[]; yearly: number } {
  const from = addDays(ctx.today, -90)
  const span = Math.min(
    90,
    Math.max(
      30,
      -(
        parseIso(ctx.transactions.at(-1)?.date ?? ctx.today).getTime() -
        parseIso(ctx.today).getTime()
      ) / 86_400_000
    )
  )
  const fees = ctx.transactions.filter(
    (t) => t.date > from && t.category === "fees" && t.amount < 0
  )
  const total = fees.reduce((s, t) => s - t.amount, 0)
  const yearly = (total * 365) / span
  const groups = new Map<
    string,
    {
      kind: (typeof FEE_KINDS)[number]
      total: number
      count: number
      txs: Transaction[]
    }
  >()
  for (const t of fees) {
    const kind =
      FEE_KINDS.find(
        (k) => k.re.test(t.description) || k.re.test(t.merchant)
      ) ?? FEE_KINDS.at(-1)!
    const g = groups.get(kind.key) ?? { kind, total: 0, count: 0, txs: [] }
    g.total -= t.amount
    g.count++
    g.txs.push(t)
    groups.set(kind.key, g)
  }
  const tips: Tip[] = []
  for (const g of groups.values()) {
    if (g.total < 3) continue
    const y = (g.total * 365) / span
    tips.push({
      id: `fees:${g.kind.key}:${ctx.thisMonth}`,
      kind:
        g.kind.key === "overdraft" || g.kind.key === "interest"
          ? "warn"
          : "save",
      area: "fees",
      title: g.kind.title,
      body: `${plural(g.count, "charge")} totalling ${money(g.total)} in the last ${r0(span)} days, about ${about(y)} a year. ${g.kind.advice}`,
      yearly: y,
      action: {
        label: "See these fees",
        to: link("/transactions", {
          category: "fees",
          merchants: merchantsOf(g.txs),
          from: addDays(ctx.today, -89),
        }),
      },
      priority: g.kind.priority + Math.min(50, y / 10),
    })
  }
  return { tips, yearly }
}
