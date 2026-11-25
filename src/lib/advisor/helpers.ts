import type { Category, Cycle, Transaction } from "../api"
import { CATEGORY_META, NON_SPEND } from "../categories"
import { parseCustomCycle } from "../cycles"
import { formatMoney } from "../format"
import type { MonthFigures } from "./types"

export const r0 = (n: number) => Math.round(n)
export const money = (n: number) => formatMoney(n)
/** Whole-currency figure for estimates, where cents would imply false precision. */
export const about = (n: number) =>
  formatMoney(Math.round(n)).replace(/\.00$/, "")
export const pct = (n: number) => `${Math.round(n * 100)}%`
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`
export const label = (c: Category) => CATEGORY_META[c].label
export const lower = (c: Category) =>
  c === "food" ? "eating out" : label(c).toLowerCase()

export const isSpend = (t: Transaction) => !NON_SPEND.has(t.category)

/** A link to a page already filtered to what a tip is about (empty values are left out). */
export function link(
  path: string,
  params: Record<string, string | undefined> = {}
) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

/** The distinct merchants behind some transactions, for the Transactions page's `merchants` filter. */
export const merchantsOf = (txs: Transaction[]) =>
  [...new Set(txs.map((t) => t.merchantKey))].join(",")

/** The Subscriptions page with these plans (or spotted charges) highlighted. */
export const subsLink = (label: string, ids: string[]) => ({
  label,
  to: link("/subscriptions", { focus: ids.join(",") }),
})
export const monthOf = (iso: string) => iso.slice(0, 7)
export const dayOf = (iso: string) => Number(iso.slice(8, 10))
export const daysInMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}
export const prevMonth = (key: string, n = 1) => {
  const [y, m] = key.split("-").map(Number)
  const d = new Date(y, m - 1 - n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
export const ordinal = (n: number) => {
  const s =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][n % 10] ?? "th")
  return `${n}${s}`
}
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

const PRESET_PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
  biennial: 0.5,
  triennial: 1 / 3,
}

/** How many times a year a cycle bills. */
export function chargesPerYear(cycle: Cycle) {
  if (cycle in PRESET_PER_YEAR) return PRESET_PER_YEAR[cycle]
  const c = parseCustomCycle(cycle)
  if (!c) return 12
  return c.unit === "weeks"
    ? 52 / c.every
    : c.unit === "months"
      ? 12 / c.every
      : 1 / c.every
}

/** Net spending (refunds cancel charges) per category over a set of transactions. */
export function spendBy(txs: Transaction[]) {
  const map = new Map<Category, number>()
  for (const t of txs)
    if (isSpend(t)) map.set(t.category, (map.get(t.category) ?? 0) - t.amount)
  return map
}

/** Money spent on things you choose day to day (not rent, bills or fees). */
export const DISCRETIONARY: ReadonlySet<Category> = new Set([
  "food",
  "shopping",
  "entertainment",
  "transport",
  "cash",
  "other",
])

export function monthFigures(txs: Transaction[], month: string): MonthFigures {
  let income = 0
  let spent = 0
  let debt = 0
  for (const t of txs) {
    if (monthOf(t.date) !== month) continue
    if (t.category === "income") income += t.amount
    else if (t.category === "debt") debt -= t.amount
    else if (isSpend(t)) spent -= t.amount
  }
  income = Math.max(0, income)
  spent = Math.max(0, spent)
  debt = Math.max(0, debt)
  return {
    month,
    income,
    spent,
    debt,
    out: spent + debt,
    net: income - spent - debt,
  }
}
