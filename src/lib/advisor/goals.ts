import { formatShortDate } from "../format"
import type { Tip, Ctx } from "./types"
import { money, about, link } from "./helpers"

export function goalTips(ctx: Ctx): Tip[] {
  const open = ctx.goals.filter(
    (g) => !g.archived && g.status !== "done" && g.access !== "view"
  )
  const tips: Tip[] = []
  const behind = open.filter(
    (g) => g.status === "behind" || g.status === "overdue"
  )
  for (const g of behind.slice(0, 2)) {
    const need =
      g.neededPerMonth !== null
        ? ctx.toHome(g.neededPerMonth, g.currency)
        : null
    const pace = ctx.toHome(g.pacePerMonth, g.currency)
    const verb = g.kind === "payoff" ? "pay" : "put in"
    const fits = need !== null && ctx.surplus !== null && ctx.surplus >= need
    tips.push({
      id: `goal:${g.id}:${g.status}:${ctx.thisMonth}`,
      kind: "warn",
      area: "goals",
      title:
        g.status === "overdue"
          ? `${g.name} is past its target date`
          : `${g.name} is falling behind`,
      body:
        g.status === "overdue"
          ? `${money(ctx.toHome(g.remaining, g.currency))} is still to go. Pick a new date you can hit so the monthly amount is realistic again.`
          : `To finish on time you’d need to ${verb} ${money(need ?? 0)} a month; lately it’s been ${money(pace)}.` +
            (fits
              ? ` Your average monthly surplus of ${about(ctx.surplus!)} would cover it.`
              : " Pushing the date out a little, or a small automatic transfer, gets it back on track."),
      action: { label: "Open goal", to: link("/goals", { focus: g.id }) },
      priority: 250,
    })
  }

  if (open.length === 0 && ctx.surplus !== null && ctx.surplus >= 150) {
    tips.push({
      id: `goal:none:${ctx.months[0]}`,
      kind: "info",
      area: "goals",
      title: "Give your surplus a job",
      body: `You’re ahead by about ${about(ctx.surplus)} a month. Naming what it’s for (a trip, an emergency fund, paying off a card) and setting a date makes it far more likely to stick around.`,
      action: { label: "Create a goal", to: "/goals" },
      priority: 130,
    })
  }

  const ahead = open.filter((g) => g.status === "ahead")
  if (ahead.length > 0) {
    tips.push({
      id: `goal:ahead:${ahead
        .map((g) => g.id)
        .toSorted()
        .join(",")}:${ctx.thisMonth}`,
      kind: "win",
      area: "goals",
      title:
        ahead.length === 1
          ? `${ahead[0].name} is ahead of schedule`
          : `${ahead.length} goals are ahead of schedule`,
      body: ahead
        .slice(0, 3)
        .map((g) =>
          g.projectedDate
            ? `${g.name} should be done by ${formatShortDate(g.projectedDate)}`
            : `${g.name} is ahead`
        )
        .join("; ")
        .concat("."),
      action: {
        label: ahead.length === 1 ? "Open goal" : "Open goals",
        to: link("/goals", { focus: ahead.map((g) => g.id).join(",") }),
      },
      priority: 25,
    })
  }
  return tips
}
