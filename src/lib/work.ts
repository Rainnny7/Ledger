import type { WorkInvoice, WorkPayment } from '@/lib/api'

/**
 * Hours typed the way people write them: "63", "43.6", "3:30", "120h 30m", "2h", "45m", "1 hr 15 min".
 * Returns null when it can't make sense of it.
 */
export function parseHours(input: string): number | null {
  let s = input.trim().toLowerCase()
  // "1,234.5" is thousands separators; a lone comma ("43,6") is a decimal point.
  s = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.')
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const colon = /^(\d+):([0-5]?\d)$/.exec(s)
  if (colon) return Number(colon[1]) + Number(colon[2]) / 60
  const hm = /^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?$/.exec(s)
  if (hm && (hm[1] || hm[2])) return Number(hm[1] ?? 0) + Number(hm[2] ?? 0) / 60
  return null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** 63 → "63", 43.6 → "43.6", 3.333… → "3.33", 1234.5 → "1,234.5". */
export const formatHours = (h: number) => round2(h).toLocaleString('en-US', { maximumFractionDigits: 2 })

/** The same, without separators, for putting back into an input. */
export const hoursInput = (h: number) => String(round2(h))

/** "63 hrs" / "1 hr" / "3 hrs 20 min" for display. */
export function formatDuration(h: number) {
  const whole = Math.floor(h + 1e-9)
  const min = Math.round((h - whole) * 60)
  const hrs = `${whole} hr${whole === 1 ? '' : 's'}`
  if (min === 0) return hrs
  if (whole === 0) return `${min} min`
  return `${hrs} ${min} min`
}

/** "$1,000.5" — the way the amounts read in chat. */
export const chatMoney = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

const mmdd = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`

/** The update line for one payment: "paid $250 11/09, $750 remaining". */
export const paymentLine = (p: Pick<WorkPayment, 'amount' | 'date' | 'remainingAfter'>) =>
  `paid ${chatMoney(p.amount)} ${mmdd(p.date)}, ${chatMoney(p.remainingAfter)} remaining`

/** The whole bill as a message, in the same shape as the hand-written ones. */
export function invoiceText(inv: WorkInvoice) {
  const head = [`done ${formatHours(inv.hours)} hours since last pay${inv.proofUrl ? ` ${inv.proofUrl}` : ''}`]
  if (inv.counterHours !== null) head.push(`new hour count: ${formatHours(inv.counterHours)}`)
  head.push(`total is ${chatMoney(inv.total)}`)
  const lines = [head.join('\n')]
  for (const p of inv.payments) lines.push(`-----\n\n${paymentLine(p)}`)
  return lines.join('\n\n')
}

export const EVERY_PRESETS = [
  { days: 7, label: 'Weekly' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Monthly' },
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
