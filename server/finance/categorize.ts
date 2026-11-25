/**
 * Turns raw bank descriptions ("UBER CANADA/UBE _V", "TIM HORTONS #1234") into a clean
 * merchant name, a stable merchant key, and a spending category. Pure functions — unit-tested.
 */

import { PRESET_CYCLES, type Category, type Cycle, type CycleUnit, type PresetCycle } from '../../shared/categories.ts'

export { CATEGORIES, isCategory, PRESET_CYCLES, type Category, type Cycle, type CycleUnit, type PresetCycle } from '../../shared/categories.ts'

interface Known {
  re: RegExp
  name: string
  category: Category
}

/** Well-known merchants: matched first, give a nice display name. Order matters (Uber Eats before Uber). */
const KNOWN: Known[] = [
  { re: /uber\s*\*?\s*eats|ubereats/i, name: 'Uber Eats', category: 'food' },
  { re: /\buber\b/i, name: 'Uber', category: 'transport' },
  { re: /\blyft\b/i, name: 'Lyft', category: 'transport' },
  { re: /doordash/i, name: 'DoorDash', category: 'food' },
  { re: /skip\s*the\s*dishes|skipthedishes/i, name: 'SkipTheDishes', category: 'food' },
  { re: /tim\s*horton/i, name: 'Tim Hortons', category: 'food' },
  { re: /mcdonald/i, name: "McDonald's", category: 'food' },
  { re: /starbucks/i, name: 'Starbucks', category: 'food' },
  { re: /^usat\b|^usat_/i, name: 'Vending machine', category: 'food' },
  { re: /netflix/i, name: 'Netflix', category: 'subscriptions' },
  { re: /spotify/i, name: 'Spotify', category: 'subscriptions' },
  { re: /disney\s*\+|disneyplus/i, name: 'Disney+', category: 'subscriptions' },
  { re: /\bcrave\b/i, name: 'Crave', category: 'subscriptions' },
  { re: /amazon\S*\s*prime|prime\s*video|amzn\s*prime/i, name: 'Amazon Prime', category: 'subscriptions' },
  { re: /apple\.com\/bill|^apple\.c(om)?\b|itunes/i, name: 'Apple', category: 'subscriptions' },
  { re: /youtube\s*(premium|music)?|google\s*\*?\s*youtube/i, name: 'YouTube', category: 'subscriptions' },
  { re: /google\s*\*?\s*(storage|one|gsuite|workspace)/i, name: 'Google One', category: 'subscriptions' },
  { re: /openai|chatgpt/i, name: 'OpenAI', category: 'subscriptions' },
  { re: /anthropic|claude\.ai/i, name: 'Anthropic', category: 'subscriptions' },
  { re: /patreon/i, name: 'Patreon', category: 'subscriptions' },
  { re: /xbox|microsoft\s*\*?\s*(store|xbox|365)/i, name: 'Microsoft', category: 'subscriptions' },
  { re: /playstation|sony\s*interactive/i, name: 'PlayStation', category: 'entertainment' },
  { re: /\bsteam\b|steampowered|valve/i, name: 'Steam', category: 'entertainment' },
  { re: /nintendo/i, name: 'Nintendo', category: 'entertainment' },
  { re: /epic\s*games/i, name: 'Epic Games', category: 'entertainment' },
  { re: /twitch/i, name: 'Twitch', category: 'entertainment' },
  { re: /cineple/i, name: 'Cineplex', category: 'entertainment' },
  { re: /ticketmaster/i, name: 'Ticketmaster', category: 'entertainment' },
  { re: /telus/i, name: 'Telus', category: 'bills' },
  { re: /rogers/i, name: 'Rogers', category: 'bills' },
  { re: /\bbell\s*(canada|mobility|media)?\b/i, name: 'Bell', category: 'bills' },
  { re: /\bfido\b/i, name: 'Fido', category: 'bills' },
  { re: /koodo/i, name: 'Koodo', category: 'bills' },
  { re: /freedom\s*mobile/i, name: 'Freedom Mobile', category: 'bills' },
  { re: /virgin\s*(plus|mobile)/i, name: 'Virgin Plus', category: 'bills' },
  { re: /amazon|amzn/i, name: 'Amazon', category: 'shopping' },
  { re: /wal-?mart/i, name: 'Walmart', category: 'shopping' },
  { re: /costco/i, name: 'Costco', category: 'groceries' },
  { re: /best\s*buy/i, name: 'Best Buy', category: 'shopping' },
  { re: /canadian\s*tire/i, name: 'Canadian Tire', category: 'shopping' },
  { re: /dollarama/i, name: 'Dollarama', category: 'shopping' },
  { re: /shoppers\s*drug/i, name: 'Shoppers Drug Mart', category: 'health' },
  { re: /petro[\s-]*can/i, name: 'Petro-Canada', category: 'transport' },
  { re: /\besso\b/i, name: 'Esso', category: 'transport' },
  { re: /\bshell\b/i, name: 'Shell', category: 'transport' },
  { re: /\bpresto\b/i, name: 'PRESTO', category: 'transport' },
  { re: /uber\s*direct/i, name: 'Uber Direct', category: 'shopping' },
  { re: /metrolinx|\bgo\s*transit\b/i, name: 'GO Transit', category: 'transport' },
  { re: /via\s*rail/i, name: 'VIA Rail', category: 'transport' },
  { re: /giant\s*tiger/i, name: 'Giant Tiger', category: 'shopping' },
  { re: /fairstone/i, name: 'Fairstone', category: 'debt' },
  { re: /easy\s*financial/i, name: 'easyfinancial', category: 'debt' },
  { re: /paypal/i, name: 'PayPal', category: 'shopping' },
]

/** Category rules for everything else, checked against the raw description. */
const RULES: { re: RegExp; category: Category; sign?: 'in' | 'out' }[] = [
  // Loan repayments: money leaves, but it pays down a balance rather than buying anything. Before
  // transfers, whose "pymt" would otherwise claim "LOAN PYMT".
  { re: /lendcare|spring\s*financial|\bmogo\b|nslsc|student\s*loan|\bosap\b|loan\s*(pmt|pymt|payment)/i, category: 'debt', sign: 'out' },
  { re: /payroll|pay\s*roll|salary|direct\s*dep|\bpay\b.*\bdep|canada\s*(fed|gst|child)|gst\s*credit|cra\s*(refund|tax)|ei\s*canada/i, category: 'income', sign: 'in' },
  { re: /e-?\s*tfr|e-?transfer|interac|\btfr\b|transfer|\bto\s*c\/c\b|payment\s*-?\s*thank\s*you|visa\s*payment|cc\s*payment|wealthsimple|questrade|\bws\s*invest|mb-?\s*(credit\s*card|loc)|pymt|bill\s*pmt.*td\s*visa|currency\s*conversion/i, category: 'transfers' },
  { re: /\bfee\b|fees|service\s*charge|monthly\s*plan|\bnsf\b|overdraft|od\s*(handling|int)|\bint\b.*(od|overdraft)|annual\s*fee/i, category: 'fees' },
  { re: /interest/i, category: 'income', sign: 'in' },
  { re: /interest/i, category: 'fees', sign: 'out' },
  { re: /\batm\b|\bw\/d\b|withdraw|cash\s*adv|abm/i, category: 'cash' },
  { re: /hydro|enbridge|utilit|insurance|\bins\b|\brent\b|property\s*tax|city\s*of|water\s*bill|internet|wireless|mobility|teksavvy|cogeco|\bshaw\b|videotron/i, category: 'bills' },
  { re: /loblaw|no\s*frills|sobeys|\bmetro\b|food\s*basics|freshco|superstore|safeway|save-?on|farm\s*boy|t\s*&\s*t|longo|whole\s*foods|grocery|grocer|market|fortinos|zehrs|iga\b|maxi\b|provigo|walmart\s*supercentre/i, category: 'groceries' },
  { re: /restaurant|resto|pizza|burger|sushi|cafe|caf[ée]|coffee|bistro|grill|\bbar\b|\bpub\b|kitchen|diner|tacos?|shawarma|pho|ramen|a\s*&\s*w|wendy|subway|kfc|popeyes|chipotle|harvey|dairy\s*queen|domino|pizza\s*pizza|little\s*caesar|five\s*guys|mary\s*brown|osmow|freshii|bakery|donut|tea\b|chatime|boba|deli/i, category: 'food' },
  { re: /gas\b|fuel|husky|pioneer|ultramar|circle\s*k|parking|impark|green\s*p|\bttc\b|transit|\bgo\s*transit\b|via\s*rail|taxi|car\s*wash|\b407\b/i, category: 'transport' },
  { re: /pharma|rexall|dental|dentist|clinic|physio|optom|medical|health|goodlife|fit4less|planet\s*fitness|\bgym\b|la\s*fitness/i, category: 'health' },
  { re: /netflix|spotify|subscription|membership|\bplus\b|premium/i, category: 'subscriptions' },
  { re: /cinema|theatre|theater|movie|concert|game|bowling|golf|arcade|museum|tickets?\b/i, category: 'entertainment' },
  { re: /store|shop|mart|winners|marshalls|homesense|ikea|sephora|h\s*&\s*m|zara|uniqlo|old\s*navy|gap\b|ebay|etsy|aliexpress|temu|shein|indigo|staples|home\s*depot|lowe'?s|rona|sport\s*chek|apple\s*store/i, category: 'shopping' },
]

const SMALL_WORDS = new Set(['and', 'of', 'the', 'to', 'at', 'in', 'on', 'for'])

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      if (!w) return w
      if (i > 0 && SMALL_WORDS.has(w)) return w
      if (/\.(ca|com|net|org|io)$/.test(w)) return w.charAt(0).toUpperCase() + w.slice(1)
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

/** Payment processors that prefix the real merchant ("PAYPAL *SPOTIFY", "SQ *CAFE"). */
const PROCESSOR = /^(sq ?\*|tst[*-] ?|pp\*|paypal ?\*|sp ?\*|dd ?\*|ic\*|py ?\*)/i

/**
 * Strip TD's channel suffixes (_V visa debit, _M mastercard…), processor prefixes, dates,
 * foreign-currency amounts, store numbers and city noise.
 */
export function stripNoise(desc: string): string {
  let s = desc.replace(/\s+/g, ' ').trim()
  s = s.replace(/\s+_[A-Z]{1,2}$/i, '')
  // Suffix glued to a number: "UBER CAN REV 11/20_V", "CURSOR, AI 20.00_V".
  s = s.replace(/(?<=\d)_[A-Z]{1,2}$/i, '')
  // Original foreign-currency amount ("CURSOR, AI 20.00").
  s = s.replace(/\s+\d+\.\d{2}$/, '')
  // Dates baked into the description ("PODP FEE SEP/10/2025", "REV 11/20").
  s = s.replace(/\s*\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[/ -]\d{1,2}([/ -]\d{2,4})?\b/gi, '')
  s = s.replace(/\s*\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, '')
  s = s.replace(PROCESSOR, '')
  s = s.replace(/^([oaf]?pos |visa debit (pur|rfnd)\s*-?\s*|purchase\s*-\s*)/i, '')
  s = s.replace(/\s*#\s*\d+.*$/, '')
  s = s.replace(/\s+\d{4,}.*$/, '')
  s = s.replace(/[*_]+\s*\w{0,12}$/, (m) => (/\d/.test(m) ? '' : m))
  // Per-payment reference codes ("FAIRSTONE RF Y4U5X7", "VIA RAIL/6WXCVQ") would make every
  // charge a different merchant: drop a trailing token of 5+ letters and digits mixed.
  s = s.replace(/[\s/](?=[a-z]*\d)(?=\d*[a-z])[a-z0-9]{5,}$/i, '')
  s = s.replace(/\s+rf$/i, '') // "RF" (reference) left behind by the line above
  s = s.replace(/\/\w{1,4}$/, '') // "UBER CANADA/UBE"
  s = s.replace(/\s+(on|qc|bc|ab|mb|sk|ns|nb|nl|pe)\s*$/i, '')
  return s.trim() || desc.trim()
}

export interface Classified {
  merchant: string
  merchantKey: string
  category: Category
}

export function merchantKeyOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Classify one transaction. `amount` sign matters (negative = money out). */
/**
 * Results by description and sign. Every list of transactions is classified on each request, and
 * the same few thousand descriptions come up over and over, so the regex work is done once each.
 */
const classified = new Map<string, Classified>()
const CACHE_LIMIT = 50_000

/** Merchant name, merchant key and automatic category for a bank description. */
export function classify(description: string, amount: number): Classified {
  const key = `${Math.sign(amount)}|${description}`
  const hit = classified.get(key)
  if (hit) return hit
  const result = classifyUncached(description, amount)
  if (classified.size >= CACHE_LIMIT) classified.clear()
  classified.set(key, result)
  return result
}

function classifyUncached(description: string, amount: number): Classified {
  const raw = description.replace(/\s+/g, ' ').trim()
  const cleaned = stripNoise(raw)

  // E-transfers keep the counterparty-free label so they group together.
  if (/e-?\s*tfr|e-?transfer/i.test(raw)) {
    const name = amount < 0 ? 'e-Transfer sent' : 'e-Transfer received'
    return { merchant: name, merchantKey: merchantKeyOf(name), category: 'transfers' }
  }

  // Match the cleaned name first so "PAYPAL *SPOTIFY" is Spotify, not PayPal. The raw text is
  // the fallback (some patterns need words stripNoise removes), except for processor-prefixed
  // charges, where the raw text would only ever say "PayPal".
  const known =
    KNOWN.find((k) => k.re.test(cleaned)) ?? (PROCESSOR.test(raw) ? undefined : KNOWN.find((k) => k.re.test(raw)))
  const viaPaypal = /^paypal ?\*|^pp\*/i.test(raw)
  // PayPal truncates names ("PAYPAL *DI"); keep the processor in tiny ones so they stay readable.
  const merchant = known?.name ?? (viaPaypal && cleaned.length < 4 ? `PayPal ${cleaned}` : titleCase(cleaned))
  let category: Category = known?.category ?? 'other'

  if (!known) {
    const dir = amount < 0 ? 'out' : 'in'
    const rule = RULES.find((r) => (!r.sign || r.sign === dir) && r.re.test(PROCESSOR.test(raw) ? cleaned : raw))
    if (rule) category = rule.category
    // Money arriving "from PayPal" is a withdrawal of a PayPal balance; unknown PayPal spending is shopping.
    else if (viaPaypal) category = amount > 0 ? 'transfers' : 'shopping'
  }
  // Money coming back from a shop is a refund, not income; anything else positive & unknown is income.
  if (amount > 0 && category === 'other') category = 'income'

  return { merchant, merchantKey: merchantKeyOf(merchant), category }
}

// ---------------------------------------------------------------- recurring detection


const CUSTOM_CYCLE = /^every-(\d{1,3})-(weeks|months|years)$/
/** Upper bound per unit for custom periods (2 years of weeks, 10 years of months, 10 years). */
const CUSTOM_MAX: Record<CycleUnit, number> = { weeks: 104, months: 120, years: 10 }

const PRESET_SPEC: Record<PresetCycle, { days: number } | { months: number }> = {
  weekly: { days: 7 },
  biweekly: { days: 14 },
  monthly: { months: 1 },
  quarterly: { months: 3 },
  semiannual: { months: 6 },
  yearly: { months: 12 },
  biennial: { months: 24 },
  triennial: { months: 36 },
}

/** How far one cycle moves a date: a fixed number of days, or whole months (keeps the day of month). */
export function cycleSpec(cycle: Cycle): { days: number } | { months: number } {
  if (cycle in PRESET_SPEC) return PRESET_SPEC[cycle as PresetCycle]
  const m = CUSTOM_CYCLE.exec(cycle)
  if (!m) return { months: 1 }
  const n = Number(m[1])
  return m[2] === 'weeks' ? { days: 7 * n } : { months: m[2] === 'months' ? n : 12 * n }
}

export function isCycle(v: unknown): v is Cycle {
  if (typeof v !== 'string') return false
  if ((PRESET_CYCLES as readonly string[]).includes(v)) return true
  const m = CUSTOM_CYCLE.exec(v)
  return !!m && Number(m[1]) >= 1 && Number(m[1]) <= CUSTOM_MAX[m[2] as CycleUnit]
}

/** Average length of one cycle in days. */
export function cycleDays(cycle: Cycle): number {
  const spec = cycleSpec(cycle)
  return 'days' in spec ? spec.days : spec.months * 30.4375
}

const DAY = 86_400_000
const toTime = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
export const toIso = (t: number) => new Date(t).toISOString().slice(0, 10)

function cycleFor(days: number): Cycle | null {
  if (days >= 6 && days <= 8) return 'weekly'
  if (days >= 13 && days <= 16) return 'biweekly'
  if (days >= 26 && days <= 35) return 'monthly'
  if (days >= 85 && days <= 97) return 'quarterly'
  if (days >= 350 && days <= 380) return 'yearly'
  return null
}

/** Move an ISO date forward by n cycles, keeping the day-of-month for month-based cycles. */
export function addCycle(iso: string, cycle: Cycle, n = 1): string {
  const spec = cycleSpec(cycle)
  if ('days' in spec) return toIso(toTime(iso) + n * spec.days * DAY)
  const months = spec.months * n
  const y = +iso.slice(0, 4)
  const m = +iso.slice(5, 7) - 1 + months
  const d = +iso.slice(8, 10)
  const target = new Date(Date.UTC(y, m, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return toIso(target.getTime())
}

/** First occurrence on or after `today`, rolling `anchor` forward by whole cycles. */
export function nextDue(anchor: string, cycle: Cycle, today: string): string {
  let d = anchor
  // Roll backward isn't needed: an anchor in the future is already the next due date.
  for (let i = 0; d < today && i < 2000; i++) d = addCycle(anchor, cycle, i + 1)
  return d
}

export function monthlyEquivalent(amount: number, cycle: Cycle) {
  return Math.round(((amount * cycleDays('monthly')) / cycleDays(cycle)) * 100) / 100
}

export interface TxLike {
  date: string
  amount: number
  merchant: string
  merchantKey: string
  category: Category
}

export interface RecurringGuess {
  /** Stable id for this suggestion: merchant key + rounded amount (a merchant can have several plans). */
  id: string
  merchantKey: string
  name: string
  category: Category
  amount: number
  cycle: Cycle
  lastDate: string
  nextDue: string
  occurrences: number
}

/** Never subscriptions: money moving between your own accounts, cash and pay. */
const NEVER_RECURRING = new Set<Category>(['transfers', 'cash', 'income'])
/**
 * Everyday spending: a charge here only counts as recurring when the amount is identical every
 * time and it happened at least three times (e.g. a DashPass or transit pass, not your usual coffee).
 */
const STRICT = new Set<Category>(['food', 'groceries', 'transport'])

/** How many of the most recent gaps between charges decide the cadence. */
const RECENT_GAPS = 6

/** Two charges are "the same plan" when they're within this much of each other. */
export const amountTolerance = (amount: number) => Math.max(0.5, amount * 0.2)

/** Split one merchant's charges into amount bands (a plan's price can change a little; other plans differ). */
function clusterByAmount(list: TxLike[], strict: boolean): TxLike[][] {
  const sorted = [...list].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  const clusters: TxLike[][] = []
  for (const t of sorted) {
    const amt = Math.abs(t.amount)
    const cur = clusters[clusters.length - 1]
    // Compare against the band's largest charge so a band can't creep upward/downward indefinitely.
    const top = cur && Math.abs(cur[0].amount)
    if (cur && (strict ? Math.abs(top - amt) < 0.005 : top - amt <= amountTolerance(amt))) cur.push(t)
    else clusters.push([t])
  }
  return clusters.map((c) => c.sort((a, b) => a.date.localeCompare(b.date)))
}

/** Find charges that repeat at a regular cadence with a stable amount. */
export function detectRecurring(txs: TxLike[], today: string): RecurringGuess[] {
  const groups = new Map<string, TxLike[]>()
  for (const t of txs) {
    if (t.amount >= 0 || NEVER_RECURRING.has(t.category)) continue
    const g = groups.get(t.merchantKey)
    if (g) g.push(t)
    else groups.set(t.merchantKey, [t])
  }

  const out: RecurringGuess[] = []
  for (const [key, list] of groups) {
    if (list.length < 2) continue
    list.sort((a, b) => a.date.localeCompare(b.date))
    const strict = STRICT.has(list[list.length - 1].category)
    let found = false
    for (const band of clusterByAmount(list, strict)) {
      const guess = cadenceOf(band, strict, today)
      if (!guess) continue
      found = true
      out.push({ ...guess, merchantKey: key, id: `${key}#${Math.round(guess.amount)}` })
    }
    // No fixed-price plan, but the merchant as a whole bills on schedule (interest, metered bills).
    if (!found && !strict) {
      const guess = cadenceOf(list, false, today)
      if (guess) out.push({ ...guess, merchantKey: key, id: key })
    }
  }
  // One suggestion per id (two bands can round to the same dollar): keep the more established one.
  const byId = new Map<string, RecurringGuess>()
  for (const g of out) if ((byId.get(g.id)?.occurrences ?? 0) < g.occurrences) byId.set(g.id, g)
  return [...byId.values()].sort((a, b) => a.nextDue.localeCompare(b.nextDue))
}

function cadenceOf(band: TxLike[], strict: boolean, today: string): Omit<RecurringGuess, 'id' | 'merchantKey'> | null {
  // Ignore same-day duplicates.
  const dates = [...new Set(band.map((t) => t.date))]
  if (dates.length < (strict ? 3 : 2)) return null
  // Judge the recent pattern: a plan that settled into a rhythm shouldn't be held back by a messy first year.
  const gaps = dates
    .slice(1)
    .map((d, i) => (toTime(d) - toTime(dates[i])) / DAY)
    .slice(-RECENT_GAPS)
  const sorted = [...gaps].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const cycle = cycleFor(median)
  if (!cycle) return null
  // Most gaps must agree with the cadence (a gap of two cycles is one skipped charge).
  const agree = gaps.filter((g) => cycleFor(g) === cycle || cycleFor(g / 2) === cycle).length
  if (agree / gaps.length < (strict ? 0.75 : 0.6)) return null
  // Needs 3+ charges unless monthly-or-longer (2 is enough to suggest a monthly bill).
  if (dates.length < 3 && (cycle === 'weekly' || cycle === 'biweekly')) return null
  // A weekly habit (Saturday coffee) isn't a subscription; everyday spending needs a long weekly run.
  if (strict && dates.length < 6 && (cycle === 'weekly' || cycle === 'biweekly')) return null
  const lastDate = dates[dates.length - 1]
  // Stale: missed more than two cycles → probably cancelled.
  if ((toTime(today) - toTime(lastDate)) / DAY > cycleDays(cycle) * 2 + 5) return null

  const last = band[band.length - 1]
  return {
    name: last.merchant,
    category: last.category === 'other' || last.category === 'shopping' ? 'subscriptions' : last.category,
    amount: Math.abs(last.amount),
    cycle,
    lastDate,
    nextDue: nextDue(addCycle(lastDate, cycle), cycle, today),
    occurrences: band.length,
  }
}
