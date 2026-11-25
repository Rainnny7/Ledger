import type { Subscription } from "../api"
import { shiftCycle } from "../cycles"
import { addDays, formatShortDate } from "../format"
import type { Tip, AdvisorInput, Ctx } from "./types"
import {
  r0,
  money,
  about,
  pct,
  plural,
  subsLink,
  chargesPerYear,
} from "./helpers"

export interface OwnSub {
  s: Subscription
  /** Price per charge, in the home currency. */
  price: number
  monthly: number
  yearly: number
}

/** Active subscriptions you pay for yourself (ones shared with you are someone else's bill). */
export function ownSubscriptions(input: AdvisorInput): OwnSub[] {
  return input.subscriptions
    .filter((s) => s.active && s.access === "owner")
    .map((s) => {
      const price = input.toHome(s.amount, s.currency)
      const yearly = price * chargesPerYear(s.cycle)
      return { s, price, monthly: yearly / 12, yearly }
    })
}

const VIDEO =
  /netflix|disney|crave|prime\s*video|apple\s*tv|paramount|hulu|\bmax\b|hbo|peacock|youtube\s*(premium|tv)|britbox|mubi|dazn|curiosity|discovery\+|shudder|crunchyroll/i
const MUSIC =
  /spotify|apple\s*music|youtube\s*music|tidal|deezer|amazon\s*music|pandora|qobuz/i

export function subscriptionTips(
  ctx: Ctx,
  subs: OwnSub[],
  yearlyTotal: number
): Tip[] {
  const tips: Tip[] = []
  const go = { label: "Review subscriptions", to: "/subscriptions" }
  const open = (s: Subscription) => subsLink(`Open ${s.name}`, [s.id])

  if (subs.length > 0 && yearlyTotal > 0) {
    const share = ctx.hasIncome ? yearlyTotal / 12 / ctx.avgIncome! : null
    tips.push({
      id: `subs-total:${subs.length}:${r0(yearlyTotal / 50)}`,
      kind: "info",
      area: "subscriptions",
      title: `Your subscriptions cost ${about(yearlyTotal)} a year`,
      body: `${plural(subs.length, "active subscription")} work out to ${money(yearlyTotal / 12)} a month${share !== null ? `, ${pct(share)} of your income` : ""}. Going through them once a year and cancelling one you barely use is one of the easiest savings there is.`,
      action: go,
      priority: share !== null && share > 0.08 ? 230 : 110,
    })
  }

  // Overlapping services.
  for (const [kind, re, what] of [
    ["video", VIDEO, "streaming services"],
    ["music", MUSIC, "music services"],
  ] as const) {
    const group = subs.filter(
      (x) => re.test(x.s.name) || re.test(x.s.merchantKey ?? "")
    )
    const min = kind === "video" ? 3 : 2
    if (group.length < min) continue
    const total = group.reduce((s, x) => s + x.monthly, 0)
    const keep = Math.max(...group.map((x) => x.monthly))
    tips.push({
      id: `overlap:${kind}:${group
        .map((x) => x.s.id)
        .sort()
        .join(",")}`,
      kind: "save",
      area: "subscriptions",
      title: `You pay for ${group.length} ${what}`,
      body:
        kind === "video"
          ? `${group.map((x) => x.s.name).join(", ")} come to ${money(total)} a month. Keeping one at a time and switching when you’ve finished what you’re watching would save about ${about((total - keep) * 12)} a year.`
          : `${group.map((x) => x.s.name).join(" and ")} overlap almost entirely and cost ${money(total)} a month together. Keeping just one saves about ${about((total - keep) * 12)} a year.`,
      yearly: (total - keep) * 12,
      action: subsLink(
        "Compare them",
        group.map((x) => x.s.id)
      ),
      priority: 260,
    })
  }

  // Price increases, read from the actual charges (only for plans billed in the home currency,
  // so exchange-rate wobble isn't mistaken for a price change).
  for (const x of subs) {
    const { s } = x
    if (!s.merchantKey || s.currency !== ctx.home) continue
    const charges = ctx.transactions
      .filter(
        (t) => t.merchantKey === s.merchantKey && t.amount < 0 && !t.pending
      )
      .slice(0, 4)
    if (charges.length < 2) continue
    const [latest, prev, before] = charges.map((t) => -t.amount)
    const stable =
      before === undefined || Math.abs(before - prev) <= prev * 0.01
    if (
      !stable ||
      latest < prev * 1.04 ||
      latest - prev < 0.5 ||
      charges[0].date < addDays(ctx.today, -75)
    )
      continue
    const yearly = (latest - prev) * chargesPerYear(s.cycle)
    tips.push({
      id: `price-up:${s.id}:${latest.toFixed(2)}`,
      kind: "warn",
      area: "subscriptions",
      title: `${s.name} went up in price`,
      body: `Your last charge on ${formatShortDate(charges[0].date)} was ${money(latest)}, up from ${money(prev)} (${pct(latest / prev - 1)} more, about ${about(yearly)} a year). Worth checking whether a cheaper plan or an annual option fits.`,
      yearly: 0,
      action: open(s),
      priority: 280,
    })
  }

  // Tracked as active, but the charges stopped.
  for (const x of subs) {
    const { s } = x
    if (!s.lastCharge || chargesPerYear(s.cycle) < 1) continue
    const expected = shiftCycle(s.lastCharge.date, s.cycle, 1)
    if (addDays(expected, 10) >= ctx.today) continue
    tips.push({
      id: `stale:${s.id}:${s.lastCharge.date}`,
      kind: "info",
      area: "subscriptions",
      title: `No charge from ${s.name} since ${formatShortDate(s.lastCharge.date)}`,
      body: `The next one was due around ${formatShortDate(expected)}. If you cancelled it, pause it so your totals stay right; if the price changed, update the amount, or open the latest charge and count it toward this subscription, so Ledger can match the charges again.`,
      action: open(s),
      priority: 150,
    })
  }

  // Long-running monthly plans are often cheaper paid yearly.
  const longMonthly = subs
    .filter(
      (x) =>
        x.s.cycle === "monthly" && x.s.payments.length >= 6 && x.monthly >= 5
    )
    .sort((a, b) => b.monthly - a.monthly)
  if (longMonthly.length > 0) {
    const top = longMonthly.slice(0, 3)
    const yearly = top.reduce((s, x) => s + x.yearly, 0) * 0.15
    const names = top.map((x) => `${x.s.name} (${x.s.payments.length} months)`)
    tips.push({
      id: `annual:${top
        .map((x) => x.s.id)
        .sort()
        .join(",")}`,
      kind: "save",
      area: "subscriptions",
      title: "Switch long-running plans to yearly billing",
      body: `You’ve paid monthly for ${names.join(", ")}. Many services knock 15–20% off for paying yearly; if you’re keeping them anyway, that’s about ${about(yearly)} a year back.`,
      yearly,
      action: subsLink(
        "See these plans",
        top.map((x) => x.s.id)
      ),
      priority: 170,
    })
  }

  // The single most expensive plan deserves a yearly "still worth it?".
  const priciest = [...subs].sort((a, b) => b.monthly - a.monthly)[0]
  if (priciest && priciest.monthly >= 30 && priciest.s.category !== "bills") {
    tips.push({
      id: `priciest:${priciest.s.id}:${ctx.today.slice(0, 4)}`,
      kind: "info",
      area: "subscriptions",
      title: `Is ${priciest.s.name} still worth it?`,
      body: `It’s your priciest subscription at ${money(priciest.monthly)} a month, ${about(priciest.yearly)} a year. If you’re not using it every week, pausing or downgrading it is the biggest single subscription saving you have.`,
      action: open(priciest.s),
      priority: 100,
    })
  }

  // Recurring charges Ledger spotted that aren't tracked yet.
  const untracked = ctx.suggestions
  if (untracked.length > 0) {
    const monthly = untracked.reduce(
      (s, g) => s + (Math.abs(g.amount) * chargesPerYear(g.cycle)) / 12,
      0
    )
    tips.push({
      id: `untracked:${untracked
        .map((g) => g.id)
        .sort()
        .join(",")}`,
      kind: "info",
      area: "subscriptions",
      title: `${plural(untracked.length, "recurring charge")} you’re not tracking`,
      body: `Ledger spotted ${untracked
        .slice(0, 3)
        .map((g) => g.name)
        .join(
          ", "
        )}${untracked.length > 3 ? " and more" : ""} billing you regularly, about ${money(monthly)} a month. Track them to see every renewal coming, or dismiss the ones that aren’t subscriptions.`,
      action: subsLink(
        "Review charges",
        untracked.map((g) => g.id)
      ),
      priority: 210,
    })
  }
  return tips
}
