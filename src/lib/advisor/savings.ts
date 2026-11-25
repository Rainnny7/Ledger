import { formatMonth } from "../format"
import type { Tip, Ctx } from "./types"
import { r0, money, about, pct, plural, link, monthOf } from "./helpers"

export function savingsTips(ctx: Ctx): Tip[] {
  const { savingsRate: rate, avgIncome, avgOut, figures } = ctx
  if (rate === null || avgIncome === null || avgOut === null) return []
  const span = `the last ${plural(figures.length, "full month")}`
  const tips: Tip[] = []
  const negative = figures.filter((m) => m.income > 0 && m.net < 0)

  if (rate < 0) {
    tips.push({
      id: `saving:negative:${ctx.months[0]}`,
      kind: "warn",
      area: "savings",
      title: "You’re spending more than you earn",
      body: `Over ${span} you brought in ${money(avgIncome)} a month on average and spent ${money(avgOut)}, a gap of ${money(avgOut - avgIncome)} a month. Start with the biggest category on the Insights page and look for one thing to cut back.`,
      action: {
        label: "See cash flow",
        to: link("/insights", { range: "6m" }),
      },
      priority: 380,
    })
  } else if (rate < 0.1) {
    const need = avgIncome * 0.1 - (avgIncome - avgOut)
    tips.push({
      id: `saving:low:${ctx.months[0]}`,
      kind: "save",
      area: "savings",
      title: `You’re keeping ${pct(rate)} of your income`,
      body: `A common first target is 10%. Over ${span} that would have meant spending about ${about(need)} less a month. Setting up an automatic transfer on payday makes it happen before you can spend it.`,
      action: {
        label: "See cash flow",
        to: link("/insights", { range: "6m" }),
      },
      priority: 240,
    })
  } else if (rate >= 0.2) {
    tips.push({
      id: `saving:great:${ctx.months[0]}`,
      kind: "win",
      area: "savings",
      title: `You’re keeping ${pct(rate)} of your income`,
      body: `Over ${span} you averaged ${money(avgIncome - avgOut)} a month left over after spending. That’s above the 20% many planners aim for. Make sure it’s going somewhere useful: a goal, savings, or investments.`,
      action: { label: "Open goals", to: "/goals" },
      priority: 30,
    })
  }

  if (negative.length >= 2 && rate >= 0) {
    tips.push({
      id: `saving:uneven:${ctx.months[0]}`,
      kind: "info",
      area: "savings",
      title: `You overspent in ${plural(negative.length, "month")} recently`,
      body: `${negative.map((m) => formatMonth(m.month, "long")).join(" and ")} went out more than came in, even though you’re ahead on average. A small monthly buffer smooths out the expensive months.`,
      priority: 140,
    })
  }

  // A regular move of money into savings is the habit that matters most.
  const savingsIds = new Set(
    ctx.accounts
      .filter((a) => a.type === "savings" || a.type === "investment")
      .map((a) => a.id)
  )
  if (savingsIds.size > 0) {
    const perMonth = ctx.months.map((m) =>
      ctx.transactions
        .filter(
          (t) =>
            savingsIds.has(t.accountId) &&
            monthOf(t.date) === m &&
            t.category === "transfers" &&
            t.amount > 0
        )
        .reduce((s, t) => s + t.amount, 0)
    )
    const regular = perMonth.filter((v) => v > 0).length
    if (ctx.months.length >= 2 && regular === ctx.months.length) {
      const avg = perMonth.reduce((s, v) => s + v, 0) / perMonth.length
      tips.push({
        id: `saving:habit:${ctx.months[0]}`,
        kind: "win",
        area: "savings",
        title: "You move money into savings every month",
        body: `About ${about(avg)} a month on average. Paying yourself first like this is the habit that matters most${ctx.surplus !== null && ctx.surplus > avg * 0.5 ? `; with ${about(ctx.surplus)} a month to spare, you could raise it` : ""}.`,
        priority: 20,
      })
    } else if (regular === 0 && ctx.surplus !== null && ctx.surplus > 100) {
      tips.push({
        id: `saving:automate:${ctx.months[0]}`,
        kind: "save",
        area: "savings",
        title: "Automate a transfer to savings",
        body: `You have ${about(ctx.surplus)} a month left over on average, but none of it is moving into savings. A transfer scheduled for the day after payday, even a small one, makes saving the default.`,
        priority: 200,
      })
    }
  }
  return tips
}

export interface Cushion {
  cash: number
  months: number
  chequing: number
}

export function cushionOf(ctx: Ctx): Cushion | null {
  if (ctx.avgOut === null || ctx.avgOut < 100) return null
  const liquid = ctx.accounts.filter(
    (a) => a.type === "chequing" || a.type === "savings" || a.type === "wallet"
  )
  if (liquid.length === 0) return null
  const cash = liquid.reduce((s, a) => s + Math.max(0, a.balance ?? 0), 0)
  const chequing = liquid
    .filter((a) => a.type === "chequing")
    .reduce((s, a) => s + Math.max(0, a.balance ?? 0), 0)
  return { cash, chequing, months: cash / ctx.avgOut }
}

const EMERGENCY = /emergency|rainy|cushion|buffer|safety/i

export function cushionTips(ctx: Ctx, c: Cushion | null): Tip[] {
  if (!c || ctx.avgOut === null) return []
  const goal = ctx.goals.find((g) => !g.archived && EMERGENCY.test(g.name))
  const action = goal
    ? { label: "Open goal", to: link("/goals", { focus: goal.id }) }
    : { label: "Start a goal", to: "/goals" }
  const target = ctx.avgOut * 3
  const tips: Tip[] = []
  if (c.months < 1) {
    tips.push({
      id: `cushion:thin:${ctx.thisMonth}`,
      kind: "warn",
      area: "savings",
      title: "Your cash cushion is thin",
      body: `Your chequing and savings hold ${money(c.cash)}, less than one month of your usual spending (${money(ctx.avgOut)}). Aim for one month first, then three; it’s what keeps a surprise bill off a credit card.${goal ? "" : " An emergency fund goal will track it for you."}`,
      action,
      priority: 330,
    })
  } else if (c.months < 3) {
    const perMonth = (target - c.cash) / 12
    tips.push({
      id: `cushion:build:${ctx.thisMonth}`,
      kind: "info",
      area: "savings",
      title: `Your cash covers ${c.months.toFixed(1)} months of spending`,
      body: `Three months (about ${about(target)}) is a common emergency fund target. Putting aside ${about(perMonth)} a month would get you there in a year.`,
      action,
      priority: 160,
    })
  } else if (c.months >= 6) {
    tips.push({
      id: `cushion:solid:${ctx.thisMonth}`,
      kind: "win",
      area: "savings",
      title: `${r0(c.months)} months of spending in the bank`,
      body: "That’s a solid emergency fund. Anything well beyond six months could be working harder in a goal or invested.",
      priority: 15,
    })
  }

  // Money parked in chequing beyond what a month needs could be earning something.
  const idle = c.chequing - ctx.avgOut * 1.5
  if (idle >= 1000) {
    const yearly = idle * 0.03
    tips.push({
      id: `cushion:idle:${ctx.thisMonth}`,
      kind: "save",
      area: "savings",
      title: `About ${about(idle)} is sitting idle in chequing`,
      body: `That’s more than a month and a half of spending on top of what you need. In a high-interest savings account at around 3% it would earn roughly ${about(yearly)} a year, and still be there when you need it.`,
      yearly,
      priority: 175,
    })
  }
  return tips
}
