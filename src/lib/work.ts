import type { WorkInvoice, WorkPayment } from "@/lib/api"
import { formatMoney, formatShortDate } from "@/lib/format"

/**
 * Hours typed the way people write them: "63", "43.6", "3:30", "120h 30m", "2h", "45m", "1 hr 15 min".
 * Returns null when it can't make sense of it.
 */
export function parseHours(input: string): number | null {
  let s = input.trim().toLowerCase()
  // "1,234.5" is thousands separators; a lone comma ("43,6") is a decimal point.
  s = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)
    ? s.replace(/,/g, "")
    : s.replace(/,/g, ".")
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const colon = /^(\d+):([0-5]?\d)$/.exec(s)
  if (colon) return Number(colon[1]) + Number(colon[2]) / 60
  const hm =
    /^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?$/.exec(
      s
    )
  if (hm && (hm[1] || hm[2]))
    return Number(hm[1] ?? 0) + Number(hm[2] ?? 0) / 60
  return null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** 63 → "63", 43.6 → "43.6", 3.333… → "3.33", 1234.5 → "1,234.5". */
export const formatHours = (h: number) =>
  round2(h).toLocaleString("en-US", { maximumFractionDigits: 2 })

/** The same, without separators, for putting back into an input. */
export const hoursInput = (h: number) => String(round2(h))

/** "63 hrs" / "1 hr" / "3 hrs 20 min" for display. */
export function formatDuration(h: number) {
  const whole = Math.floor(h + 1e-9)
  const min = Math.round((h - whole) * 60)
  const hrs = `${whole} hr${whole === 1 ? "" : "s"}`
  if (min === 0) return hrs
  if (whole === 0) return `${min} min`
  return `${hrs} ${min} min`
}

const hrs = (h: number) => `${formatHours(h)} hr${round2(h) === 1 ? "" : "s"}`

/** The update for one payment: "Received $250.00 on Nov 9 · $750.00 left on this bill". */
export function paymentLine(
  p: Pick<WorkPayment, "amount" | "date" | "remainingAfter">,
  currency: string
) {
  const left =
    p.remainingAfter > 0.005
      ? `${formatMoney(p.remainingAfter, currency)} left on this bill`
      : "paid in full, thank you!"
  return `Received ${formatMoney(p.amount, currency)} on ${formatShortDate(p.date)} · ${left}`
}

/**
 * The whole bill as a message to paste into a chat or email:
 *
 *   Hours for Nov 24
 *   43.5 hrs × $28.50/hr = $1,239.75
 *   Hour tracker now at 320.5 hrs
 *   Proof: https://…
 *
 *   Payments so far
 *   • Nov 9 — $250.00
 *   • Nov 16 — $250.00
 *
 *   Paid $500.00 of $1,239.75 · $739.75 left
 */
export function invoiceText(inv: WorkInvoice, currency: string) {
  const money = (n: number) => formatMoney(n, currency)
  const agreed = Math.abs(inv.total - round2(inv.hours * inv.rate)) > 0.005
  const head = [
    `Hours for ${formatShortDate(inv.date)}`,
    agreed
      ? `${hrs(inv.hours)} at ${money(inv.rate)}/hr · agreed total ${money(inv.total)}`
      : `${hrs(inv.hours)} × ${money(inv.rate)}/hr = ${money(inv.total)}`,
  ]
  if (inv.counterHours !== null)
    head.push(`Hour tracker now at ${hrs(inv.counterHours)}`)
  if (inv.proofUrl) head.push(`Proof: ${inv.proofUrl}`)
  const blocks = [head.join("\n")]

  if (inv.payments.length > 0) {
    blocks.push(
      [
        "Payments so far",
        ...inv.payments.map(
          (p) => `• ${formatShortDate(p.date)} — ${money(p.amount)}`
        ),
      ].join("\n")
    )
  }

  if (inv.remaining <= 0.005) {
    blocks.push(
      `Paid in full${inv.paidAt ? ` on ${formatShortDate(inv.paidAt)}` : ""}, thank you!`
    )
  } else if (inv.paid > 0) {
    blocks.push(
      `Paid ${money(inv.paid)} of ${money(inv.total)} · ${money(inv.remaining)} left`
    )
  } else {
    blocks.push(`Total due: ${money(inv.total)}`)
  }
  return blocks.join("\n\n")
}

export const EVERY_PRESETS = [
  { days: 7, label: "Weekly" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Monthly" },
] as const

/** "weekly", "every 2 weeks", "every 10 days" — how often a job pays. */
export function payEveryLabel(days: number) {
  const preset = EVERY_PRESETS.find((p) => p.days === days)
  return preset ? preset.label.toLowerCase() : `every ${days} days`
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
