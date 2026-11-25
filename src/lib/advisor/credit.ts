import type { Account } from "../api"
import { addDays } from "../format"
import type { Tip, Ctx } from "./types"
import { money, about, pct, plural, subsLink } from "./helpers"
import type { OwnSub } from "./subscriptions"

export interface Credit {
  used: number
  limit: number
  util: number
  cards: Account[]
}

export function creditOf(accounts: Account[]): Credit | null {
  const cards = accounts.filter((a) => a.type === "credit")
  let used = 0
  let limit = 0
  for (const a of cards) {
    const l =
      a.creditLimit ??
      (a.available !== null && a.balance !== null
        ? a.available + a.balance
        : null)
    if (!l) continue
    used += Math.max(0, a.balance ?? 0)
    limit += l
  }
  return limit > 0 ? { used, limit, util: used / limit, cards } : null
}

export function creditTips(c: Credit | null): Tip[] {
  if (!c || c.util < 0.3) return []
  const high = c.util >= 0.7
  return [
    {
      id: `credit:${high ? "high" : "mid"}`,
      kind: high ? "warn" : "info",
      area: "credit",
      title: `You’re using ${pct(c.util)} of your credit`,
      body: `${money(c.used)} owed on ${money(c.limit)} of limits. Keeping it under 30% (${about(c.limit * 0.3)}) helps your credit score; paying the card down before the statement date, not just by the due date, lowers the reported balance.`,
      // Opens the card with the most owing: the one to start paying down.
      action: (() => {
        const top = [...c.cards].toSorted(
          (a, b) => (b.balance ?? 0) - (a.balance ?? 0)
        )[0]
        return top
          ? {
              label: c.cards.length === 1 ? "Open card" : `Open ${top.name}`,
              to: `/accounts/${top.id}`,
            }
          : undefined
      })(),
      priority: high ? 320 : 150,
    },
  ]
}

export function overdraftTips(accounts: Account[]): Tip[] {
  return accounts
    .filter(
      (a) =>
        a.type !== "credit" &&
        a.type !== "loan" &&
        ((a.overdraftUsed ?? 0) > 0 || (a.balance ?? 0) < 0)
    )
    .map((a) => ({
      id: `overdraft:${a.id}`,
      kind: "warn" as const,
      area: "credit" as const,
      title: `${a.name} is in overdraft`,
      body: `You’re ${money(a.overdraftUsed || Math.abs(a.balance ?? 0))} below zero. Overdraft interest is usually around 20% a year plus a monthly fee, so this is one of the most expensive ways to borrow; topping it back up comes first.`,
      action: { label: "Open account", to: `/accounts/${a.id}` },
      priority: 360,
    }))
}

/** Bills due soon that your chequing balance wouldn't cover. */
export function upcomingTips(ctx: Ctx, subs: OwnSub[]): Tip[] {
  const until = addDays(ctx.today, 14)
  const chequing = ctx.accounts.filter((a) => a.type === "chequing")
  if (chequing.length === 0) return []
  const chequingIds = new Set(chequing.map((a) => a.id))
  // Only bills that come out of chequing (card ones go on the card).
  const due = subs.filter(
    (x) =>
      x.s.nextDue <= until &&
      (x.s.accountId === null || chequingIds.has(x.s.accountId))
  )
  const total = due.reduce((s, x) => s + x.price, 0)
  const cash = chequing.reduce((s, a) => s + (a.available ?? a.balance ?? 0), 0)
  if (total <= 0 || total <= cash) return []
  return [
    {
      id: `upcoming:${until}`,
      kind: "warn",
      area: "credit",
      title: "Upcoming bills are more than your chequing balance",
      body: `${plural(due.length, "payment")} totalling ${money(total)} ${due.length === 1 ? "is" : "are"} due in the next two weeks, and chequing has ${money(cash)}. Move money over or check when your next pay lands to avoid an overdraft or NSF fee.`,
      action: subsLink(
        "See what’s due",
        due.map((x) => x.s.id)
      ),
      priority: 370,
    },
  ]
}
