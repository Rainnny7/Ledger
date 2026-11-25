import { roundMoney } from "../../shared/money.ts"
import { generateMogul } from "./mogul.ts"
import type { Persona } from "./personas.ts"
import { type Draft, iso, rng } from "./util.ts"

/** A year and a bit of everyday banking for a persona: pay, rent, bills, card spending and PayPal. */
export function generate(today: Date, p: Persona) {
  if (p.id === "musk") return generateMogul(today)
  const rand = rng(20240611)
  const between = (lo: number, hi: number) =>
    roundMoney(lo + rand() * (hi - lo))
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const start = new Date(
    Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth() - 1, 1)
  )
  const chequing: Draft[] = []
  const savings: Draft[] = []
  const visa: Draft[] = []
  const paypal: Draft[] = []

  const end = iso(today)
  for (
    let d = new Date(start);
    iso(d) <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const day = iso(d)
    const dom = d.getUTCDate()
    const dow = d.getUTCDay()
    const add = (list: Draft[], description: string, amount: number) =>
      list.push({ date: day, description, amount })
    const daysSince = Math.round((d.getTime() - start.getTime()) / 86_400_000)

    // Income: bi-weekly pay on Fridays.
    if (
      p.pay.every === "biweekly"
        ? dow === 5 && Math.floor(daysSince / 7) % 2 === 0
        : dom === 1
    )
      add(chequing, p.pay.description, p.pay.amount)
    // Housing and bills.
    if (dom === 1) add(chequing, p.rent.description, -p.rent.amount)
    if (dom === 3) {
      add(chequing, "TFR-TO SAVINGS 6243", -p.savingsTransfer)
      add(savings, "TFR-FR CHEQUING 4417", p.savingsTransfer)
    }
    if (dom === 8) add(chequing, p.phone.description, -p.phone.amount)
    if (dom === 12 && p.hydro)
      add(chequing, "HYDRO ONE NETWORKS", -between(p.hydro.lo, p.hydro.hi))
    if (dom === 15 && p.gas)
      add(chequing, "ENBRIDGE GAS PAD", -between(p.gas.lo, p.gas.hi))
    if (dom === 20) add(chequing, "MONTHLY PLAN FEE", -4.95)
    if (dom === 28) add(savings, "INTEREST", roundMoney(6 + daysSince / 60))
    if (dom === 18 && daysSince > 20) {
      // Pay last month's card spending.
      const prev = visa
        .filter(
          (t) =>
            t.amount < 0 &&
            t.date < day &&
            t.date >= iso(new Date(d.getTime() - 31 * 86_400_000))
        )
        .reduce((s, t) => s - t.amount, 0)
      if (prev > 0) {
        add(chequing, "TD VISA PAYMENT", -roundMoney(prev))
        add(visa, "PAYMENT - THANK YOU", roundMoney(prev))
      }
    }

    // Subscriptions on the card.
    for (const [subDom, description, amount] of p.cardSubs)
      if (dom === subDom) add(visa, description, -amount)
    if (
      p.id !== "student" &&
      dom === 6 &&
      d.getUTCMonth() === (today.getUTCMonth() + 5) % 12
    )
      add(visa, "AMAZON PRIME MEMBERSHIP", -99)

    // Everyday spending.
    const spend = (lo: number, hi: number) =>
      roundMoney(between(lo, hi) * p.scale)
    if (dow === 6 || (dow === 3 && rand() < 0.6))
      add(
        visa,
        pick(["LOBLAWS #1123", "METRO 457", "NO FRILLS 3301", "FARM BOY 18"]),
        -spend(42, 165)
      )
    if (p.bulkShopping && dom % 16 === 2)
      add(visa, "COSTCO WHOLESALE W1270", -spend(140, 260))
    if (dow >= 1 && dow <= 5 && rand() < 0.45)
      add(
        visa,
        pick(["TIM HORTONS #2231", "STARBUCKS 04518", "BALZAC'S COFFEE"]),
        -spend(2.4, 7.8)
      )
    if (rand() < 0.16)
      add(
        visa,
        pick([
          "UBER EATS",
          "PIZZA NOVA 112",
          "PHO HUNG",
          "FIVE GUYS 1488",
          "SUSHI MAKI BAR",
        ]),
        -spend(18, 62)
      )
    if (dow === 1 && rand() < 0.8)
      add(visa, "PRESTO AUTOLOAD", -roundMoney(40 * Math.max(p.scale, 0.8)))
    if (rand() < 0.07)
      add(
        visa,
        pick(["SHELL C01234", "PETRO-CANADA 8812", "ESSO 4471"]),
        -spend(48, 78)
      )
    if (rand() < 0.04)
      add(visa, pick(["UBER TRIP", "LYFT RIDE"]), -spend(14, 38))
    if (rand() < 0.09)
      add(
        visa,
        pick([
          "AMAZON.CA MKTPLACE",
          "WINNERS 221",
          "IKEA NORTH YORK",
          "BEST BUY #934",
          "INDIGO 0187",
        ]),
        -spend(16, 140)
      )
    if (rand() < 0.035)
      add(visa, pick(["CINEPLEX ENTMT", "TICKETMASTER CA"]), -spend(19, 96))
    if (rand() < 0.03) add(visa, "SHOPPERS DRUG MART 0921", -spend(9, 46))

    // PayPal: online purchases, now and then a top-up from the bank.
    if (dom === 10 && d.getUTCMonth() % 2 === 0)
      add(paypal, "Transfer in from bank/card", 100)
    if (rand() < 0.03)
      add(
        paypal,
        pick(["Steam", "eBay seller", "Bandcamp", "Humble Bundle"]),
        -between(6, 45)
      )
  }

  return { chequing, savings, visa, paypal }
}
