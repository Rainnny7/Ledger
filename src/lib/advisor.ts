/**
 * The Advisor: reads your transactions, subscriptions, goals and balances and turns them into a
 * short list of tips (where you're overspending, subscriptions worth a second look, fees you could
 * avoid, how big your cushion is) plus an overall "money health" score.
 *
 * Everything here is a pure function of data the app already has, so it runs in the browser and
 * works the same in demo mode. Amounts are expected in the home currency (see inHomeCurrency).
 */
import type { Account, Category, Cycle, Goal, RecurringSuggestion, Subscription, Transaction } from './api'
import { CATEGORY_META, NON_SPEND } from './categories'
import { parseCustomCycle, shiftCycle } from './cycles'
import { addDays, formatMoney, formatMonth, formatShortDate, parseIso } from './format'

export type TipKind = 'warn' | 'save' | 'info' | 'win'
export type TipArea = 'spending' | 'subscriptions' | 'fees' | 'savings' | 'goals' | 'credit'

export interface Tip {
  /** Stable id; dismissing hides this exact tip. Ids that include a period come back next period. */
  id: string
  kind: TipKind
  area: TipArea
  title: string
  body: string
  /** Rough yearly amount you'd keep by acting on it. */
  yearly?: number
  action?: { label: string; to: string }
  /** Higher shows first. */
  priority: number
}

export interface HealthFactor {
  key: string
  label: string
  score: number
  max: number
  detail: string
}

export interface Health {
  score: number
  label: 'Excellent' | 'Good' | 'Fair' | 'Needs attention'
  factors: HealthFactor[]
}

export interface AdvisorSummary {
  /** Share of income left after spending and loan payments, over the last few full months. */
  savingsRate: number | null
  avgIncome: number | null
  avgOut: number | null
  /** Months your cash would cover at your usual spending. */
  cushionMonths: number | null
  subscriptionsYearly: number
  /** Sum of `yearly` over the tips you can act on. */
  potentialYearly: number
  /** The full months the averages are based on. */
  months: string[]
}

export interface AdvisorReport {
  tips: Tip[]
  health: Health | null
  summary: AdvisorSummary
}

export interface AdvisorInput {
  today: string
  home: string
  accounts: Account[]
  /** Newest first, in the home currency. */
  transactions: Transaction[]
  subscriptions: Subscription[]
  suggestions: RecurringSuggestion[]
  goals: Goal[]
  /** Converts an amount into the home currency (falls back to the amount itself). */
  toHome: (amount: number, currency: string) => number
}

// ---------------------------------------------------------------- helpers

const r0 = (n: number) => Math.round(n)
const money = (n: number) => formatMoney(n)
/** Whole-currency figure for estimates, where cents would imply false precision. */
const about = (n: number) => formatMoney(Math.round(n)).replace(/\.00$/, '')
const pct = (n: number) => `${Math.round(n * 100)}%`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const label = (c: Category) => CATEGORY_META[c].label
const lower = (c: Category) => (c === 'food' ? 'eating out' : label(c).toLowerCase())

const isSpend = (t: Transaction) => !NON_SPEND.has(t.category)

/** A link to a page already filtered to what a tip is about (empty values are left out). */
function link(path: string, params: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

/** The distinct merchants behind some transactions, for the Transactions page's `merchants` filter. */
const merchantsOf = (txs: Transaction[]) => [...new Set(txs.map((t) => t.merchantKey))].join(',')

/** The Subscriptions page with these plans (or spotted charges) highlighted. */
const subsLink = (label: string, ids: string[]) => ({ label, to: link('/subscriptions', { focus: ids.join(',') }) })
const monthOf = (iso: string) => iso.slice(0, 7)
const dayOf = (iso: string) => Number(iso.slice(8, 10))
const daysInMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
const prevMonth = (key: string, n = 1) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 - n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${s}`
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

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
  return c.unit === 'weeks' ? 52 / c.every : c.unit === 'months' ? 12 / c.every : 1 / c.every
}

/** Net spending (refunds cancel charges) per category over a set of transactions. */
function spendBy(txs: Transaction[]) {
  const map = new Map<Category, number>()
  for (const t of txs) if (isSpend(t)) map.set(t.category, (map.get(t.category) ?? 0) - t.amount)
  return map
}

/** Money spent on things you choose day to day (not rent, bills or fees). */
const DISCRETIONARY: ReadonlySet<Category> = new Set(['food', 'shopping', 'entertainment', 'transport', 'cash', 'other'])

interface MonthFigures {
  month: string
  income: number
  spent: number
  debt: number
  out: number
  net: number
}

function monthFigures(txs: Transaction[], month: string): MonthFigures {
  let income = 0
  let spent = 0
  let debt = 0
  for (const t of txs) {
    if (monthOf(t.date) !== month) continue
    if (t.category === 'income') income += t.amount
    else if (t.category === 'debt') debt -= t.amount
    else if (isSpend(t)) spent -= t.amount
  }
  income = Math.max(0, income)
  spent = Math.max(0, spent)
  debt = Math.max(0, debt)
  return { month, income, spent, debt, out: spent + debt, net: income - spent - debt }
}

// ---------------------------------------------------------------- the report

export function buildAdvice(input: AdvisorInput): AdvisorReport {
  const { today, transactions: txs } = input
  const thisMonth = monthOf(today)
  const earliest = txs.at(-1)?.date ?? today

  // The last three full months that the history actually covers (a few days' slack for the first).
  const months: string[] = []
  for (let i = 1; i <= 3; i++) {
    const m = prevMonth(thisMonth, i)
    if (earliest <= `${m}-05`) months.push(m)
  }
  const figures = months.map((m) => monthFigures(txs, m))
  const avg = (f: (m: MonthFigures) => number) => (figures.length ? figures.reduce((s, m) => s + f(m), 0) / figures.length : null)
  const avgIncome = avg((m) => m.income)
  const avgOut = avg((m) => m.out)
  const hasIncome = avgIncome !== null && avgIncome >= 100
  const savingsRate = hasIncome && avgOut !== null ? (avgIncome - avgOut) / avgIncome : null
  const surplus = hasIncome && avgOut !== null ? avgIncome - avgOut : null

  const ctx: Ctx = { ...input, thisMonth, months, figures, avgIncome, avgOut, hasIncome, savingsRate, surplus }

  const cushion = cushionOf(ctx)
  const credit = creditOf(input.accounts)
  const fees = feesOf(ctx)
  const subs = ownSubscriptions(input)
  const subscriptionsYearly = subs.reduce((s, x) => s + x.yearly, 0)

  const tips: Tip[] = [
    ...paceTips(ctx),
    ...habitTips(ctx),
    ...diningTips(ctx),
    ...weekendTips(ctx),
    ...subscriptionTips(ctx, subs, subscriptionsYearly),
    ...fees.tips,
    ...savingsTips(ctx),
    ...cushionTips(ctx, cushion),
    ...creditTips(credit),
    ...overdraftTips(input.accounts),
    ...upcomingTips(ctx, subs),
    ...goalTips(ctx),
  ]
  tips.sort((a, b) => b.priority - a.priority)

  const potentialYearly = tips.reduce((s, t) => s + (t.kind !== 'win' && t.yearly ? t.yearly : 0), 0)

  return {
    tips,
    health: healthOf(ctx, cushion, credit, fees.yearly),
    summary: {
      savingsRate,
      avgIncome: hasIncome ? avgIncome : null,
      avgOut,
      cushionMonths: cushion?.months ?? null,
      subscriptionsYearly,
      potentialYearly,
      months,
    },
  }
}

interface Ctx extends AdvisorInput {
  thisMonth: string
  months: string[]
  figures: MonthFigures[]
  avgIncome: number | null
  avgOut: number | null
  hasIncome: boolean
  savingsRate: number | null
  surplus: number | null
}

// ---------------------------------------------------------------- spending

/**
 * This month so far vs what you'd usually have spent by this day of the month, per category.
 * Comparing like-for-like days keeps rent-on-the-1st style bills from looking like a spike.
 */
function paceTips(ctx: Ctx): Tip[] {
  const day = dayOf(ctx.today)
  if (day < 5 || ctx.months.length < 2) return []
  const now = spendBy(ctx.transactions.filter((t) => monthOf(t.date) === ctx.thisMonth))
  const byDay = ctx.months.map((m) => {
    const cut = `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, '0')}`
    return spendBy(ctx.transactions.filter((t) => monthOf(t.date) === m && t.date <= cut))
  })
  const full = ctx.months.map((m) => spendBy(ctx.transactions.filter((t) => monthOf(t.date) === m)))
  const mean = (maps: Map<Category, number>[], c: Category) => maps.reduce((s, m) => s + Math.max(0, m.get(c) ?? 0), 0) / maps.length

  const tips: Tip[] = []
  const hot: { c: Category; spent: number; usual: number; month: number; over: number }[] = []
  for (const [c, spent] of now) {
    const usual = mean(byDay, c)
    const over = spent - usual
    if (spent < 60 || over < 40 || spent < usual * 1.3) continue
    hot.push({ c, spent, usual, month: mean(full, c), over })
  }
  hot.sort((a, b) => b.over - a.over)
  for (const h of hot.slice(0, 2)) {
    const landing = h.spent + Math.max(0, h.month - h.usual)
    tips.push({
      id: `pace:${h.c}:${ctx.thisMonth}`,
      kind: 'warn',
      area: 'spending',
      title: `${label(h.c)} is running ahead of usual`,
      body:
        `You’ve spent ${money(h.spent)} on ${lower(h.c)} so far this month. By the ${ordinal(day)} you’d usually be at about ${about(h.usual)}` +
        (h.month > 0 ? `, and the rest of the month typically adds ${about(Math.max(0, h.month - h.usual))}, so you’re heading for roughly ${about(landing)} against a usual ${about(h.month)}.` : '.'),
      action: { label: `See ${lower(h.c)} this month`, to: link('/transactions', { category: h.c, from: `${ctx.thisMonth}-01`, flow: 'out' }) },
      priority: 300 + Math.min(90, h.over / 10),
    })
  }

  // Overall discretionary spending well under the usual pace is worth saying out loud.
  const sumOf = (m: Map<Category, number>) => [...m].reduce((s, [c, v]) => (DISCRETIONARY.has(c) ? s + v : s), 0)
  const spentNow = sumOf(now)
  const usualNow = byDay.reduce((s, m) => s + sumOf(m), 0) / byDay.length
  if (day >= 10 && usualNow > 100 && spentNow < usualNow * 0.85 && usualNow - spentNow >= 50) {
    tips.push({
      id: `pace-win:${ctx.thisMonth}`,
      kind: 'win',
      area: 'spending',
      title: 'You’re spending less than usual this month',
      body: `Day-to-day spending is ${money(spentNow)} so far, about ${about(usualNow - spentNow)} (${pct(1 - spentNow / usualNow)}) below where you usually are by the ${ordinal(day)}. Keep it up and consider moving the difference to savings.`,
      priority: 40,
    })
  }
  return tips
}

const COFFEE = /coffee|caf[eé]|espresso|starbucks|tim hortons|\btims\b|second cup|balzac|dunkin|peet|pret a manger|costa\b|blenz|bridgehead/i
const DELIVERY = /uber\s*eats|doordash|door dash|skip\s*the\s*dishes|skipthedishes|grubhub|deliveroo|postmates|foodora|just eat|menulog|seamless|fantuan/i

/** Small purchases that add up: coffee runs, delivery apps, and any merchant you visit very often. */
function habitTips(ctx: Ctx): Tip[] {
  const from = addDays(ctx.today, -30)
  const recent = ctx.transactions.filter((t) => t.date > from && t.amount < 0 && isSpend(t))
  const tips: Tip[] = []
  const scale = 365 / 30

  const coffee = recent.filter((t) => COFFEE.test(t.merchant) || COFFEE.test(t.description))
  const coffeeTotal = coffee.reduce((s, t) => s - t.amount, 0)
  if (coffee.length >= 6 && coffeeTotal >= 25) {
    const places = new Set(coffee.map((t) => t.merchant)).size
    tips.push({
      id: `habit:coffee:${ctx.thisMonth}`,
      kind: 'save',
      area: 'spending',
      title: 'Your coffee runs add up',
      body: `${plural(coffee.length, 'coffee purchase')} in the last 30 days${places > 1 ? ` across ${places} places` : ''}, ${money(coffeeTotal)} in all (about ${money(coffeeTotal / coffee.length)} each). That’s roughly ${about(coffeeTotal * scale)} a year; making half of them at home would keep about ${about((coffeeTotal * scale) / 2)}.`,
      yearly: (coffeeTotal * scale) / 2,
      action: { label: 'See purchases', to: link('/transactions', { merchants: merchantsOf(coffee), from: addDays(ctx.today, -29) }) },
      priority: 200 + Math.min(80, coffeeTotal / 5),
    })
  }

  const delivery = recent.filter((t) => DELIVERY.test(t.merchant) || DELIVERY.test(t.description))
  const deliveryTotal = delivery.reduce((s, t) => s - t.amount, 0)
  if (delivery.length >= 3 && deliveryTotal >= 60) {
    tips.push({
      id: `habit:delivery:${ctx.thisMonth}`,
      kind: 'save',
      area: 'spending',
      title: 'Delivery apps cost more than they look',
      body: `${plural(delivery.length, 'delivery order')} in the last 30 days came to ${money(deliveryTotal)}. Service fees, delivery fees and menu markups often add 20–30%; picking up the same order yourself, or cooking one of those nights, would save around ${about(deliveryTotal * scale * 0.25)} a year.`,
      yearly: deliveryTotal * scale * 0.25,
      action: { label: 'See orders', to: link('/transactions', { merchants: merchantsOf(delivery), from: addDays(ctx.today, -29) }) },
      priority: 200 + Math.min(80, deliveryTotal / 8),
    })
  }

  // Any other merchant you're at constantly, for small amounts each time.
  const counted = new Set([...coffee, ...delivery].map((t) => t.id))
  const byMerchant = new Map<string, { name: string; count: number; total: number }>()
  for (const t of recent) {
    if (counted.has(t.id) || -t.amount > 25 || !DISCRETIONARY.has(t.category)) continue
    const row = byMerchant.get(t.merchantKey) ?? { name: t.merchant, count: 0, total: 0 }
    row.count++
    row.total -= t.amount
    byMerchant.set(t.merchantKey, row)
  }
  const frequent = [...byMerchant.entries()].filter(([, m]) => m.count >= 8 && m.total >= 40).sort((a, b) => b[1].total - a[1].total)
  for (const [key, m] of frequent.slice(0, 1)) {
    tips.push({
      id: `habit:${key}:${ctx.thisMonth}`,
      kind: 'save',
      area: 'spending',
      title: `${m.name} is a regular stop`,
      body: `${plural(m.count, 'purchase')} at ${m.name} in the last 30 days, ${money(m.total)} in total. Small, frequent buys are the easiest to trim: cutting them by a third saves about ${about((m.total * scale) / 3)} a year.`,
      yearly: (m.total * scale) / 3,
      action: { label: 'See purchases', to: link('/transactions', { merchants: key, from: addDays(ctx.today, -29), flow: 'out' }) },
      priority: 180 + Math.min(60, m.total / 5),
    })
  }
  return tips
}

/** Eating out vs groceries over the last 90 days. */
function diningTips(ctx: Ctx): Tip[] {
  const from = addDays(ctx.today, -90)
  if (ctx.transactions.at(-1)!.date > addDays(from, 14)) return []
  const by = spendBy(ctx.transactions.filter((t) => t.date > from))
  const food = Math.max(0, by.get('food') ?? 0)
  const groceries = Math.max(0, by.get('groceries') ?? 0)
  if (food < 150 || food <= groceries * 1.1) return []
  const yearly = (food * 365) / 90 * 0.25
  return [
    {
      id: `dining:${ctx.thisMonth}`,
      kind: 'save',
      area: 'spending',
      title: 'Eating out costs more than your groceries',
      body: `In the last 90 days you spent ${money(food)} at restaurants, cafés and takeout and ${money(groceries)} on groceries. Swapping a quarter of those meals for home cooking would save about ${about(yearly)} a year.`,
      yearly,
      action: { label: 'See eating out', to: link('/insights', { range: '90d', category: 'food' }) },
      priority: 190 + Math.min(60, food / 50),
    },
  ]
}

/** Whether day-to-day spending clusters on weekends. */
function weekendTips(ctx: Ctx): Tip[] {
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
  if (weekend < 200 || perWeekday <= 0 || perWeekend < perWeekday * 1.75) return []
  return [
    {
      id: `weekend:${ctx.thisMonth}`,
      kind: 'info',
      area: 'spending',
      title: 'Weekends are where the money goes',
      action: { label: 'See spending', to: link('/insights', { range: '90d' }) },
      body: `Over the last 12 weeks you spent about ${money(perWeekend)} per weekend day on eating out, shopping and fun, ${(perWeekend / perWeekday).toFixed(1)}× a typical weekday. Planning one low-spend weekend a month is an easy win.`,
      priority: 120,
    },
  ]
}

// ---------------------------------------------------------------- subscriptions

interface OwnSub {
  s: Subscription
  /** Price per charge, in the home currency. */
  price: number
  monthly: number
  yearly: number
}

/** Active subscriptions you pay for yourself (ones shared with you are someone else's bill). */
function ownSubscriptions(input: AdvisorInput): OwnSub[] {
  return input.subscriptions
    .filter((s) => s.active && s.access === 'owner')
    .map((s) => {
      const price = input.toHome(s.amount, s.currency)
      const yearly = price * chargesPerYear(s.cycle)
      return { s, price, monthly: yearly / 12, yearly }
    })
}

const VIDEO = /netflix|disney|crave|prime\s*video|apple\s*tv|paramount|hulu|\bmax\b|hbo|peacock|youtube\s*(premium|tv)|britbox|mubi|dazn|curiosity|discovery\+|shudder|crunchyroll/i
const MUSIC = /spotify|apple\s*music|youtube\s*music|tidal|deezer|amazon\s*music|pandora|qobuz/i

function subscriptionTips(ctx: Ctx, subs: OwnSub[], yearlyTotal: number): Tip[] {
  const tips: Tip[] = []
  const go = { label: 'Review subscriptions', to: '/subscriptions' }
  const open = (s: Subscription) => subsLink(`Open ${s.name}`, [s.id])

  if (subs.length > 0 && yearlyTotal > 0) {
    const share = ctx.hasIncome ? yearlyTotal / 12 / ctx.avgIncome! : null
    tips.push({
      id: `subs-total:${subs.length}:${r0(yearlyTotal / 50)}`,
      kind: 'info',
      area: 'subscriptions',
      title: `Your subscriptions cost ${about(yearlyTotal)} a year`,
      body: `${plural(subs.length, 'active subscription')} work out to ${money(yearlyTotal / 12)} a month${share !== null ? `, ${pct(share)} of your income` : ''}. Going through them once a year and cancelling one you barely use is one of the easiest savings there is.`,
      action: go,
      priority: share !== null && share > 0.08 ? 230 : 110,
    })
  }

  // Overlapping services.
  for (const [kind, re, what] of [
    ['video', VIDEO, 'streaming services'],
    ['music', MUSIC, 'music services'],
  ] as const) {
    const group = subs.filter((x) => re.test(x.s.name) || re.test(x.s.merchantKey ?? ''))
    const min = kind === 'video' ? 3 : 2
    if (group.length < min) continue
    const total = group.reduce((s, x) => s + x.monthly, 0)
    const keep = Math.max(...group.map((x) => x.monthly))
    tips.push({
      id: `overlap:${kind}:${group.map((x) => x.s.id).sort().join(',')}`,
      kind: 'save',
      area: 'subscriptions',
      title: `You pay for ${group.length} ${what}`,
      body:
        kind === 'video'
          ? `${group.map((x) => x.s.name).join(', ')} come to ${money(total)} a month. Keeping one at a time and switching when you’ve finished what you’re watching would save about ${about((total - keep) * 12)} a year.`
          : `${group.map((x) => x.s.name).join(' and ')} overlap almost entirely and cost ${money(total)} a month together. Keeping just one saves about ${about((total - keep) * 12)} a year.`,
      yearly: (total - keep) * 12,
      action: subsLink('Compare them', group.map((x) => x.s.id)),
      priority: 260,
    })
  }

  // Price increases, read from the actual charges (only for plans billed in the home currency,
  // so exchange-rate wobble isn't mistaken for a price change).
  for (const x of subs) {
    const { s } = x
    if (!s.merchantKey || s.currency !== ctx.home) continue
    const charges = ctx.transactions.filter((t) => t.merchantKey === s.merchantKey && t.amount < 0 && !t.pending).slice(0, 4)
    if (charges.length < 2) continue
    const [latest, prev, before] = charges.map((t) => -t.amount)
    const stable = before === undefined || Math.abs(before - prev) <= prev * 0.01
    if (!stable || latest < prev * 1.04 || latest - prev < 0.5 || charges[0].date < addDays(ctx.today, -75)) continue
    const yearly = (latest - prev) * chargesPerYear(s.cycle)
    tips.push({
      id: `price-up:${s.id}:${latest.toFixed(2)}`,
      kind: 'warn',
      area: 'subscriptions',
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
    if (!s.merchantKey || !s.lastCharge || chargesPerYear(s.cycle) < 1) continue
    const expected = shiftCycle(s.lastCharge.date, s.cycle, 1)
    if (addDays(expected, 10) >= ctx.today) continue
    tips.push({
      id: `stale:${s.id}:${s.lastCharge.date}`,
      kind: 'info',
      area: 'subscriptions',
      title: `No charge from ${s.name} since ${formatShortDate(s.lastCharge.date)}`,
      body: `The next one was due around ${formatShortDate(expected)}. If you cancelled it, pause it so your totals stay right; if the price changed, update the amount so Ledger can match the charges again.`,
      action: open(s),
      priority: 150,
    })
  }

  // Long-running monthly plans are often cheaper paid yearly.
  const longMonthly = subs
    .filter((x) => x.s.cycle === 'monthly' && x.s.payments.length >= 6 && x.monthly >= 5)
    .sort((a, b) => b.monthly - a.monthly)
  if (longMonthly.length > 0) {
    const top = longMonthly.slice(0, 3)
    const yearly = top.reduce((s, x) => s + x.yearly, 0) * 0.15
    const names = top.map((x) => `${x.s.name} (${x.s.payments.length} months)`)
    tips.push({
      id: `annual:${top.map((x) => x.s.id).sort().join(',')}`,
      kind: 'save',
      area: 'subscriptions',
      title: 'Switch long-running plans to yearly billing',
      body: `You’ve paid monthly for ${names.join(', ')}. Many services knock 15–20% off for paying yearly; if you’re keeping them anyway, that’s about ${about(yearly)} a year back.`,
      yearly,
      action: subsLink('See these plans', top.map((x) => x.s.id)),
      priority: 170,
    })
  }

  // The single most expensive plan deserves a yearly "still worth it?".
  const priciest = [...subs].sort((a, b) => b.monthly - a.monthly)[0]
  if (priciest && priciest.monthly >= 30 && priciest.s.category !== 'bills') {
    tips.push({
      id: `priciest:${priciest.s.id}:${ctx.today.slice(0, 4)}`,
      kind: 'info',
      area: 'subscriptions',
      title: `Is ${priciest.s.name} still worth it?`,
      body: `It’s your priciest subscription at ${money(priciest.monthly)} a month, ${about(priciest.yearly)} a year. If you’re not using it every week, pausing or downgrading it is the biggest single subscription saving you have.`,
      action: open(priciest.s),
      priority: 100,
    })
  }

  // Recurring charges Ledger spotted that aren't tracked yet.
  const untracked = ctx.suggestions
  if (untracked.length > 0) {
    const monthly = untracked.reduce((s, g) => s + (Math.abs(g.amount) * chargesPerYear(g.cycle)) / 12, 0)
    tips.push({
      id: `untracked:${untracked.map((g) => g.id).sort().join(',')}`,
      kind: 'info',
      area: 'subscriptions',
      title: `${plural(untracked.length, 'recurring charge')} you’re not tracking`,
      body: `Ledger spotted ${untracked
        .slice(0, 3)
        .map((g) => g.name)
        .join(', ')}${untracked.length > 3 ? ' and more' : ''} billing you regularly, about ${money(monthly)} a month. Track them to see every renewal coming, or dismiss the ones that aren’t subscriptions.`,
      action: subsLink('Review charges', untracked.map((g) => g.id)),
      priority: 210,
    })
  }
  return tips
}

// ---------------------------------------------------------------- fees

const FEE_KINDS: { key: string; re: RegExp; title: string; advice: string; priority: number }[] = [
  {
    key: 'overdraft',
    re: /\bnsf\b|overdraft|\bod\b|insufficient/i,
    title: 'Overdraft and NSF charges',
    advice: 'A small buffer in chequing, or a low-balance alert from your bank, usually stops these entirely.',
    priority: 290,
  },
  {
    key: 'interest',
    re: /interest/i,
    title: 'You’re paying interest',
    advice: 'Card interest usually runs 20% or more. Paying the full statement balance each month, or moving the balance to a lower-rate option, makes it go away.',
    priority: 285,
  },
  {
    key: 'foreign',
    re: /foreign|\bfx\b|conversion|intl|international|cross.?border/i,
    title: 'Foreign transaction fees',
    advice: 'A card with no foreign transaction fee would avoid the usual 2.5% on purchases in other currencies.',
    priority: 200,
  },
  {
    key: 'atm',
    re: /\batm\b|\babm\b|withdrawal fee|network fee|interac fee/i,
    title: 'ATM fees',
    advice: 'Sticking to your own bank’s machines, or getting cash back at the till, avoids these.',
    priority: 190,
  },
  {
    key: 'account',
    re: /plan fee|monthly fee|account fee|service charge|maintenance|monthly plan|annual fee/i,
    title: 'Account and card fees',
    advice: 'Many banks waive the monthly fee above a minimum balance, and there are good no-fee accounts and cards. A quick call asking for it to be waived works more often than you’d think.',
    priority: 220,
  },
]

function feesOf(ctx: Ctx): { tips: Tip[]; yearly: number } {
  const from = addDays(ctx.today, -90)
  const span = Math.min(90, Math.max(30, -(parseIso(ctx.transactions.at(-1)?.date ?? ctx.today).getTime() - parseIso(ctx.today).getTime()) / 86_400_000))
  const fees = ctx.transactions.filter((t) => t.date > from && t.category === 'fees' && t.amount < 0)
  const total = fees.reduce((s, t) => s - t.amount, 0)
  const yearly = (total * 365) / span
  const groups = new Map<string, { kind: (typeof FEE_KINDS)[number]; total: number; count: number; txs: Transaction[] }>()
  for (const t of fees) {
    const kind = FEE_KINDS.find((k) => k.re.test(t.description) || k.re.test(t.merchant)) ?? FEE_KINDS.at(-1)!
    const g = groups.get(kind.key) ?? { kind, total: 0, count: 0, txs: [] }
    g.total -= t.amount
    g.count++
    g.txs.push(t)
    groups.set(kind.key, g)
  }
  const tips: Tip[] = []
  for (const g of groups.values()) {
    if (g.total < 3) continue
    const y = (g.total * 365) / span
    tips.push({
      id: `fees:${g.kind.key}:${ctx.thisMonth}`,
      kind: g.kind.key === 'overdraft' || g.kind.key === 'interest' ? 'warn' : 'save',
      area: 'fees',
      title: g.kind.title,
      body: `${plural(g.count, 'charge')} totalling ${money(g.total)} in the last ${r0(span)} days, about ${about(y)} a year. ${g.kind.advice}`,
      yearly: y,
      action: {
        label: 'See these fees',
        to: link('/transactions', { category: 'fees', merchants: merchantsOf(g.txs), from: addDays(ctx.today, -89) }),
      },
      priority: g.kind.priority + Math.min(50, y / 10),
    })
  }
  return { tips, yearly }
}

// ---------------------------------------------------------------- saving & cushion

function savingsTips(ctx: Ctx): Tip[] {
  const { savingsRate: rate, avgIncome, avgOut, figures } = ctx
  if (rate === null || avgIncome === null || avgOut === null) return []
  const span = `the last ${plural(figures.length, 'full month')}`
  const tips: Tip[] = []
  const negative = figures.filter((m) => m.income > 0 && m.net < 0)

  if (rate < 0) {
    tips.push({
      id: `saving:negative:${ctx.months[0]}`,
      kind: 'warn',
      area: 'savings',
      title: 'You’re spending more than you earn',
      body: `Over ${span} you brought in ${money(avgIncome)} a month on average and spent ${money(avgOut)}, a gap of ${money(avgOut - avgIncome)} a month. Start with the biggest category on the Insights page and look for one thing to cut back.`,
      action: { label: 'See cash flow', to: link('/insights', { range: '6m' }) },
      priority: 380,
    })
  } else if (rate < 0.1) {
    const need = avgIncome * 0.1 - (avgIncome - avgOut)
    tips.push({
      id: `saving:low:${ctx.months[0]}`,
      kind: 'save',
      area: 'savings',
      title: `You’re keeping ${pct(rate)} of your income`,
      body: `A common first target is 10%. Over ${span} that would have meant spending about ${about(need)} less a month. Setting up an automatic transfer on payday makes it happen before you can spend it.`,
      action: { label: 'See cash flow', to: link('/insights', { range: '6m' }) },
      priority: 240,
    })
  } else if (rate >= 0.2) {
    tips.push({
      id: `saving:great:${ctx.months[0]}`,
      kind: 'win',
      area: 'savings',
      title: `You’re keeping ${pct(rate)} of your income`,
      body: `Over ${span} you averaged ${money(avgIncome - avgOut)} a month left over after spending. That’s above the 20% many planners aim for. Make sure it’s going somewhere useful: a goal, savings, or investments.`,
      action: { label: 'Open goals', to: '/goals' },
      priority: 30,
    })
  }

  if (negative.length >= 2 && rate >= 0) {
    tips.push({
      id: `saving:uneven:${ctx.months[0]}`,
      kind: 'info',
      area: 'savings',
      title: `You overspent in ${plural(negative.length, 'month')} recently`,
      body: `${negative.map((m) => formatMonth(m.month, 'long')).join(' and ')} went out more than came in, even though you’re ahead on average. A small monthly buffer smooths out the expensive months.`,
      priority: 140,
    })
  }

  // A regular move of money into savings is the habit that matters most.
  const savingsIds = new Set(ctx.accounts.filter((a) => a.type === 'savings' || a.type === 'investment').map((a) => a.id))
  if (savingsIds.size > 0) {
    const perMonth = ctx.months.map((m) =>
      ctx.transactions
        .filter((t) => savingsIds.has(t.accountId) && monthOf(t.date) === m && t.category === 'transfers' && t.amount > 0)
        .reduce((s, t) => s + t.amount, 0),
    )
    const regular = perMonth.filter((v) => v > 0).length
    if (ctx.months.length >= 2 && regular === ctx.months.length) {
      const avg = perMonth.reduce((s, v) => s + v, 0) / perMonth.length
      tips.push({
        id: `saving:habit:${ctx.months[0]}`,
        kind: 'win',
        area: 'savings',
        title: 'You move money into savings every month',
        body: `About ${about(avg)} a month on average. Paying yourself first like this is the habit that matters most${ctx.surplus !== null && ctx.surplus > avg * 0.5 ? `; with ${about(ctx.surplus)} a month to spare, you could raise it` : ''}.`,
        priority: 20,
      })
    } else if (regular === 0 && ctx.surplus !== null && ctx.surplus > 100) {
      tips.push({
        id: `saving:automate:${ctx.months[0]}`,
        kind: 'save',
        area: 'savings',
        title: 'Automate a transfer to savings',
        body: `You have ${about(ctx.surplus)} a month left over on average, but none of it is moving into savings. A transfer scheduled for the day after payday, even a small one, makes saving the default.`,
        priority: 200,
      })
    }
  }
  return tips
}

interface Cushion {
  cash: number
  months: number
  chequing: number
}

function cushionOf(ctx: Ctx): Cushion | null {
  if (ctx.avgOut === null || ctx.avgOut < 100) return null
  const liquid = ctx.accounts.filter((a) => a.type === 'chequing' || a.type === 'savings' || a.type === 'wallet')
  if (liquid.length === 0) return null
  const cash = liquid.reduce((s, a) => s + Math.max(0, a.balance ?? 0), 0)
  const chequing = liquid.filter((a) => a.type === 'chequing').reduce((s, a) => s + Math.max(0, a.balance ?? 0), 0)
  return { cash, chequing, months: cash / ctx.avgOut }
}

const EMERGENCY = /emergency|rainy|cushion|buffer|safety/i

function cushionTips(ctx: Ctx, c: Cushion | null): Tip[] {
  if (!c || ctx.avgOut === null) return []
  const goal = ctx.goals.find((g) => !g.archived && EMERGENCY.test(g.name))
  const action = goal ? { label: 'Open goal', to: link('/goals', { focus: goal.id }) } : { label: 'Start a goal', to: '/goals' }
  const target = ctx.avgOut * 3
  const tips: Tip[] = []
  if (c.months < 1) {
    tips.push({
      id: `cushion:thin:${ctx.thisMonth}`,
      kind: 'warn',
      area: 'savings',
      title: 'Your cash cushion is thin',
      body: `Your chequing and savings hold ${money(c.cash)}, less than one month of your usual spending (${money(ctx.avgOut)}). Aim for one month first, then three; it’s what keeps a surprise bill off a credit card.${goal ? '' : ' An emergency fund goal will track it for you.'}`,
      action,
      priority: 330,
    })
  } else if (c.months < 3) {
    const perMonth = (target - c.cash) / 12
    tips.push({
      id: `cushion:build:${ctx.thisMonth}`,
      kind: 'info',
      area: 'savings',
      title: `Your cash covers ${c.months.toFixed(1)} months of spending`,
      body: `Three months (about ${about(target)}) is a common emergency fund target. Putting aside ${about(perMonth)} a month would get you there in a year.`,
      action,
      priority: 160,
    })
  } else if (c.months >= 6) {
    tips.push({
      id: `cushion:solid:${ctx.thisMonth}`,
      kind: 'win',
      area: 'savings',
      title: `${r0(c.months)} months of spending in the bank`,
      body: 'That’s a solid emergency fund. Anything well beyond six months could be working harder in a goal or invested.',
      priority: 15,
    })
  }

  // Money parked in chequing beyond what a month needs could be earning something.
  const idle = c.chequing - ctx.avgOut * 1.5
  if (idle >= 1000) {
    const yearly = idle * 0.03
    tips.push({
      id: `cushion:idle:${ctx.thisMonth}`,
      kind: 'save',
      area: 'savings',
      title: `About ${about(idle)} is sitting idle in chequing`,
      body: `That’s more than a month and a half of spending on top of what you need. In a high-interest savings account at around 3% it would earn roughly ${about(yearly)} a year, and still be there when you need it.`,
      yearly,
      priority: 175,
    })
  }
  return tips
}

// ---------------------------------------------------------------- credit & overdraft

interface Credit {
  used: number
  limit: number
  util: number
  cards: Account[]
}

function creditOf(accounts: Account[]): Credit | null {
  const cards = accounts.filter((a) => a.type === 'credit')
  let used = 0
  let limit = 0
  for (const a of cards) {
    const l = a.creditLimit ?? (a.available !== null && a.balance !== null ? a.available + a.balance : null)
    if (!l) continue
    used += Math.max(0, a.balance ?? 0)
    limit += l
  }
  return limit > 0 ? { used, limit, util: used / limit, cards } : null
}

function creditTips(c: Credit | null): Tip[] {
  if (!c || c.util < 0.3) return []
  const high = c.util >= 0.7
  return [
    {
      id: `credit:${high ? 'high' : 'mid'}`,
      kind: high ? 'warn' : 'info',
      area: 'credit',
      title: `You’re using ${pct(c.util)} of your credit`,
      body: `${money(c.used)} owed on ${money(c.limit)} of limits. Keeping it under 30% (${about(c.limit * 0.3)}) helps your credit score; paying the card down before the statement date, not just by the due date, lowers the reported balance.`,
      // Opens the card with the most owing: the one to start paying down.
      action: (() => {
        const top = [...c.cards].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0]
        return top ? { label: c.cards.length === 1 ? 'Open card' : `Open ${top.name}`, to: `/accounts/${top.id}` } : undefined
      })(),
      priority: high ? 320 : 150,
    },
  ]
}

function overdraftTips(accounts: Account[]): Tip[] {
  return accounts
    .filter((a) => a.type !== 'credit' && a.type !== 'loan' && ((a.overdraftUsed ?? 0) > 0 || (a.balance ?? 0) < 0))
    .map((a) => ({
      id: `overdraft:${a.id}`,
      kind: 'warn' as const,
      area: 'credit' as const,
      title: `${a.name} is in overdraft`,
      body: `You’re ${money(a.overdraftUsed || Math.abs(a.balance ?? 0))} below zero. Overdraft interest is usually around 20% a year plus a monthly fee, so this is one of the most expensive ways to borrow; topping it back up comes first.`,
      action: { label: 'Open account', to: `/accounts/${a.id}` },
      priority: 360,
    }))
}

/** Bills due soon that your chequing balance wouldn't cover. */
function upcomingTips(ctx: Ctx, subs: OwnSub[]): Tip[] {
  const until = addDays(ctx.today, 14)
  const chequing = ctx.accounts.filter((a) => a.type === 'chequing')
  if (chequing.length === 0) return []
  const chequingIds = new Set(chequing.map((a) => a.id))
  // Only bills that come out of chequing (card ones go on the card).
  const due = subs.filter((x) => x.s.nextDue <= until && (x.s.accountId === null || chequingIds.has(x.s.accountId)))
  const total = due.reduce((s, x) => s + x.price, 0)
  const cash = chequing.reduce((s, a) => s + (a.available ?? a.balance ?? 0), 0)
  if (total <= 0 || total <= cash) return []
  return [
    {
      id: `upcoming:${until}`,
      kind: 'warn',
      area: 'credit',
      title: 'Upcoming bills are more than your chequing balance',
      body: `${plural(due.length, 'payment')} totalling ${money(total)} ${due.length === 1 ? 'is' : 'are'} due in the next two weeks, and chequing has ${money(cash)}. Move money over or check when your next pay lands to avoid an overdraft or NSF fee.`,
      action: subsLink('See what’s due', due.map((x) => x.s.id)),
      priority: 370,
    },
  ]
}

// ---------------------------------------------------------------- goals

function goalTips(ctx: Ctx): Tip[] {
  const open = ctx.goals.filter((g) => !g.archived && g.status !== 'done' && g.access !== 'view')
  const tips: Tip[] = []
  const behind = open.filter((g) => g.status === 'behind' || g.status === 'overdue')
  for (const g of behind.slice(0, 2)) {
    const need = g.neededPerMonth !== null ? ctx.toHome(g.neededPerMonth, g.currency) : null
    const pace = ctx.toHome(g.pacePerMonth, g.currency)
    const verb = g.kind === 'payoff' ? 'pay' : 'put in'
    const fits = need !== null && ctx.surplus !== null && ctx.surplus >= need
    tips.push({
      id: `goal:${g.id}:${g.status}:${ctx.thisMonth}`,
      kind: 'warn',
      area: 'goals',
      title: g.status === 'overdue' ? `${g.name} is past its target date` : `${g.name} is falling behind`,
      body:
        g.status === 'overdue'
          ? `${money(ctx.toHome(g.remaining, g.currency))} is still to go. Pick a new date you can hit so the monthly amount is realistic again.`
          : `To finish on time you’d need to ${verb} ${money(need ?? 0)} a month; lately it’s been ${money(pace)}.` +
            (fits ? ` Your average monthly surplus of ${about(ctx.surplus!)} would cover it.` : ' Pushing the date out a little, or a small automatic transfer, gets it back on track.'),
      action: { label: 'Open goal', to: link('/goals', { focus: g.id }) },
      priority: 250,
    })
  }

  if (open.length === 0 && ctx.surplus !== null && ctx.surplus >= 150) {
    tips.push({
      id: `goal:none:${ctx.months[0]}`,
      kind: 'info',
      area: 'goals',
      title: 'Give your surplus a job',
      body: `You’re ahead by about ${about(ctx.surplus)} a month. Naming what it’s for (a trip, an emergency fund, paying off a card) and setting a date makes it far more likely to stick around.`,
      action: { label: 'Create a goal', to: '/goals' },
      priority: 130,
    })
  }

  const ahead = open.filter((g) => g.status === 'ahead')
  if (ahead.length > 0) {
    tips.push({
      id: `goal:ahead:${ahead.map((g) => g.id).sort().join(',')}:${ctx.thisMonth}`,
      kind: 'win',
      area: 'goals',
      title: ahead.length === 1 ? `${ahead[0].name} is ahead of schedule` : `${ahead.length} goals are ahead of schedule`,
      body: ahead
        .slice(0, 3)
        .map((g) => (g.projectedDate ? `${g.name} should be done by ${formatShortDate(g.projectedDate)}` : `${g.name} is ahead`))
        .join('; ')
        .concat('.'),
      action: { label: ahead.length === 1 ? 'Open goal' : 'Open goals', to: link('/goals', { focus: ahead.map((g) => g.id).join(',') }) },
      priority: 25,
    })
  }
  return tips
}

// ---------------------------------------------------------------- health score

function healthOf(ctx: Ctx, cushion: Cushion | null, credit: Credit | null, feesYearly: number): Health | null {
  if (ctx.savingsRate === null) return null
  const factors: HealthFactor[] = []
  const rate = ctx.savingsRate
  factors.push({
    key: 'saving',
    label: 'Saving rate',
    max: 30,
    score: 30 * clamp01(rate / 0.2),
    detail: `${pct(rate)} of income kept (20%+ scores full marks)`,
  })
  const positive = ctx.figures.filter((m) => m.net >= 0).length
  factors.push({
    key: 'balance',
    label: 'Living within income',
    max: 15,
    score: (15 * positive) / ctx.figures.length,
    detail: `${positive} of the last ${plural(ctx.figures.length, 'month')} ended ahead`,
  })
  if (cushion) {
    const m = cushion.months
    factors.push({
      key: 'cushion',
      label: 'Cash cushion',
      max: 25,
      score: 20 * clamp01(m / 3) + 5 * clamp01((m - 3) / 3),
      detail: `${m.toFixed(1)} months of spending in the bank (6+ scores full marks)`,
    })
  }
  factors.push({
    key: 'credit',
    label: 'Credit use',
    max: 15,
    score: !credit ? 15 : credit.util <= 0.1 ? 15 : credit.util <= 0.3 ? 12 : credit.util <= 0.5 ? 7 : credit.util <= 0.75 ? 3 : 0,
    detail: credit ? `${pct(credit.util)} of your credit limits in use` : 'No credit cards linked',
  })
  factors.push({
    key: 'fees',
    label: 'Fees & interest',
    max: 15,
    score: feesYearly < 1 ? 15 : feesYearly < 50 ? 11 : feesYearly < 150 ? 6 : feesYearly < 300 ? 3 : 0,
    detail: feesYearly < 1 ? 'No fees lately' : `About ${about(feesYearly)} a year at your recent rate`,
  })
  const max = factors.reduce((s, f) => s + f.max, 0)
  const score = Math.round((factors.reduce((s, f) => s + f.score, 0) / max) * 100)
  return {
    score,
    label: score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 45 ? 'Fair' : 'Needs attention',
    factors: factors.map((f) => ({ ...f, score: Math.round(f.score * 10) / 10 })),
  }
}
