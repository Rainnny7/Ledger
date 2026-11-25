import type { Category } from "../api"
import { addDays, parseIso } from "../format"
import type { Tip, Ctx } from "./types"
import {
  money,
  about,
  pct,
  plural,
  label,
  lower,
  isSpend,
  link,
  merchantsOf,
  monthOf,
  dayOf,
  daysInMonth,
  ordinal,
  spendBy,
  DISCRETIONARY,
} from "./helpers"

const meanSpend = (maps: Map<Category, number>[], c: Category) =>
  maps.reduce((s, m) => s + Math.max(0, m.get(c) ?? 0), 0) / maps.length

const discretionarySum = (m: Map<Category, number>) =>
  [...m].reduce((s, [c, v]) => (DISCRETIONARY.has(c) ? s + v : s), 0)

/**
 * This month so far vs what you'd usually have spent by this day of the month, per category.
 * Comparing like-for-like days keeps rent-on-the-1st style bills from looking like a spike.
 */
export function paceTips(ctx: Ctx): Tip[] {
  const day = dayOf(ctx.today)
  if (day < 5 || ctx.months.length < 2) return []
  const now = spendBy(
    ctx.transactions.filter((t) => monthOf(t.date) === ctx.thisMonth)
  )
  const byDay = ctx.months.map((m) => {
    const cut = `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, "0")}`
    return spendBy(
      ctx.transactions.filter((t) => monthOf(t.date) === m && t.date <= cut)
    )
  })
  const full = ctx.months.map((m) =>
    spendBy(ctx.transactions.filter((t) => monthOf(t.date) === m))
  )
  const tips: Tip[] = []
  let hot: {
    c: Category
    spent: number
    usual: number
    month: number
    over: number
  }[] = []
  for (const [c, spent] of now) {
    const usual = meanSpend(byDay, c)
    const over = spent - usual
    if (spent < 60 || over < 40 || spent < usual * 1.3) continue
    hot.push({ c, spent, usual, month: meanSpend(full, c), over })
  }
  hot = hot.toSorted((a, b) => b.over - a.over)
  for (const h of hot.slice(0, 2)) {
    const landing = h.spent + Math.max(0, h.month - h.usual)
    tips.push({
      id: `pace:${h.c}:${ctx.thisMonth}`,
      kind: "warn",
      area: "spending",
      title: `${label(h.c)} is running ahead of usual`,
      body:
        `You’ve spent ${money(h.spent)} on ${lower(h.c)} so far this month. By the ${ordinal(day)} you’d usually be at about ${about(h.usual)}` +
        (h.month > 0
          ? `, and the rest of the month typically adds ${about(Math.max(0, h.month - h.usual))}, so you’re heading for roughly ${about(landing)} against a usual ${about(h.month)}.`
          : "."),
      action: {
        label: `See ${lower(h.c)} this month`,
        to: link("/transactions", {
          category: h.c,
          from: `${ctx.thisMonth}-01`,
        }),
      },
      priority: 300 + Math.min(90, h.over / 10),
    })
  }

  // Overall discretionary spending well under the usual pace is worth saying out loud.
  const spentNow = discretionarySum(now)
  const usualNow =
    byDay.reduce((s, m) => s + discretionarySum(m), 0) / byDay.length
  if (
    day >= 10 &&
    usualNow > 100 &&
    spentNow < usualNow * 0.85 &&
    usualNow - spentNow >= 50
  ) {
    tips.push({
      id: `pace-win:${ctx.thisMonth}`,
      kind: "win",
      area: "spending",
      title: "You’re spending less than usual this month",
      body: `Day-to-day spending is ${money(spentNow)} so far, about ${about(usualNow - spentNow)} (${pct(1 - spentNow / usualNow)}) below where you usually are by the ${ordinal(day)}. Keep it up and consider moving the difference to savings.`,
      priority: 40,
    })
  }
  return tips
}

const COFFEE =
  /coffee|caf[eé]|espresso|starbucks|tim hortons|\btims\b|second cup|balzac|dunkin|peet|pret a manger|costa\b|blenz|bridgehead/i
const DELIVERY =
  /uber\s*eats|doordash|door dash|skip\s*the\s*dishes|skipthedishes|grubhub|deliveroo|postmates|foodora|just eat|menulog|seamless|fantuan/i

/** Small purchases that add up: coffee runs, delivery apps, and any merchant you visit very often. */
export function habitTips(ctx: Ctx): Tip[] {
  const from = addDays(ctx.today, -30)
  const recent = ctx.transactions.filter(
    (t) => t.date > from && t.amount < 0 && isSpend(t)
  )
  const tips: Tip[] = []
  const scale = 365 / 30

  const coffee = recent.filter(
    (t) => COFFEE.test(t.merchant) || COFFEE.test(t.description)
  )
  const coffeeTotal = coffee.reduce((s, t) => s - t.amount, 0)
  if (coffee.length >= 6 && coffeeTotal >= 25) {
    const places = new Set(coffee.map((t) => t.merchant)).size
    tips.push({
      id: `habit:coffee:${ctx.thisMonth}`,
      kind: "save",
      area: "spending",
      title: "Your coffee runs add up",
      body: `${plural(coffee.length, "coffee purchase")} in the last 30 days${places > 1 ? ` across ${places} places` : ""}, ${money(coffeeTotal)} in all (about ${money(coffeeTotal / coffee.length)} each). That’s roughly ${about(coffeeTotal * scale)} a year; making half of them at home would keep about ${about((coffeeTotal * scale) / 2)}.`,
      yearly: (coffeeTotal * scale) / 2,
      action: {
        label: "See purchases",
        to: link("/transactions", {
          merchants: merchantsOf(coffee),
          from: addDays(ctx.today, -29),
        }),
      },
      priority: 200 + Math.min(80, coffeeTotal / 5),
    })
  }

  const delivery = recent.filter(
    (t) => DELIVERY.test(t.merchant) || DELIVERY.test(t.description)
  )
  const deliveryTotal = delivery.reduce((s, t) => s - t.amount, 0)
  if (delivery.length >= 3 && deliveryTotal >= 60) {
    tips.push({
      id: `habit:delivery:${ctx.thisMonth}`,
      kind: "save",
      area: "spending",
      title: "Delivery apps cost more than they look",
      body: `${plural(delivery.length, "delivery order")} in the last 30 days came to ${money(deliveryTotal)}. Service fees, delivery fees and menu markups often add 20–30%; picking up the same order yourself, or cooking one of those nights, would save around ${about(deliveryTotal * scale * 0.25)} a year.`,
      yearly: deliveryTotal * scale * 0.25,
      action: {
        label: "See orders",
        to: link("/transactions", {
          merchants: merchantsOf(delivery),
          from: addDays(ctx.today, -29),
        }),
      },
      priority: 200 + Math.min(80, deliveryTotal / 8),
    })
  }

  // Any other merchant you're at constantly, for small amounts each time.
  const counted = new Set([...coffee, ...delivery].map((t) => t.id))
  const byMerchant = new Map<
    string,
    { name: string; count: number; total: number }
  >()
  for (const t of recent) {
    if (counted.has(t.id) || -t.amount > 25 || !DISCRETIONARY.has(t.category))
      continue
    const row = byMerchant.get(t.merchantKey) ?? {
      name: t.merchant,
      count: 0,
      total: 0,
    }
    row.count++
    row.total -= t.amount
    byMerchant.set(t.merchantKey, row)
  }
  const frequent = [...byMerchant.entries()]
    .filter(([, m]) => m.count >= 8 && m.total >= 40)
    .toSorted((a, b) => b[1].total - a[1].total)
  for (const [key, m] of frequent.slice(0, 1)) {
    tips.push({
      id: `habit:${key}:${ctx.thisMonth}`,
      kind: "save",
      area: "spending",
      title: `${m.name} is a regular stop`,
      body: `${plural(m.count, "purchase")} at ${m.name} in the last 30 days, ${money(m.total)} in total. Small, frequent buys are the easiest to trim: cutting them by a third saves about ${about((m.total * scale) / 3)} a year.`,
      yearly: (m.total * scale) / 3,
      action: {
        label: "See purchases",
        to: link("/transactions", {
          merchants: key,
          from: addDays(ctx.today, -29),
        }),
      },
      priority: 180 + Math.min(60, m.total / 5),
    })
  }
  return tips
}

/** Eating out vs groceries over the last 90 days. */
export function diningTips(ctx: Ctx): Tip[] {
  const from = addDays(ctx.today, -90)
  if (ctx.transactions.at(-1)!.date > addDays(from, 14)) return []
  const by = spendBy(ctx.transactions.filter((t) => t.date > from))
  const food = Math.max(0, by.get("food") ?? 0)
  const groceries = Math.max(0, by.get("groceries") ?? 0)
  if (food < 150 || food <= groceries * 1.1) return []
  const yearly = ((food * 365) / 90) * 0.25
  return [
    {
      id: `dining:${ctx.thisMonth}`,
      kind: "save",
      area: "spending",
      title: "Eating out costs more than your groceries",
      body: `In the last 90 days you spent ${money(food)} at restaurants, cafés and takeout and ${money(groceries)} on groceries. Swapping a quarter of those meals for home cooking would save about ${about(yearly)} a year.`,
      yearly,
      action: {
        label: "See eating out",
        to: link("/insights", { range: "90d", category: "food" }),
      },
      priority: 190 + Math.min(60, food / 50),
    },
  ]
}

/** Whether day-to-day spending clusters on weekends. */
export function weekendTips(ctx: Ctx): Tip[] {
  const from = addDays(ctx.today, -84) // 12 whole weeks
  if (ctx.transactions.at(-1)!.date > from) return []
  let weekend = 0
  let weekday = 0
  for (const t of ctx.transactions) {
    if (t.date <= from || !DISCRETIONARY.has(t.category)) continue
    const dow = parseIso(t.date).getDay()
    if (dow === 0 || dow === 6) weekend -= t.amount
    else weekday -= t.amount
  }
  const perWeekend = weekend / 24
  const perWeekday = weekday / 60
  if (weekend < 200 || perWeekday <= 0 || perWeekend < perWeekday * 1.75)
    return []
  return [
    {
      id: `weekend:${ctx.thisMonth}`,
      kind: "info",
      area: "spending",
      title: "Weekends are where the money goes",
      action: {
        label: "See spending",
        to: link("/insights", { range: "90d" }),
      },
      body: `Over the last 12 weeks you spent about ${money(perWeekend)} per weekend day on eating out, shopping and fun, ${(perWeekend / perWeekday).toFixed(1)}× a typical weekday. Planning one low-spend weekend a month is an easy win.`,
      priority: 120,
    },
  ]
}
