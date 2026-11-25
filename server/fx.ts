import { getSetting, setSetting } from './db.ts'
import { env } from './env.ts'

/**
 * Exchange rates for showing totals in each person's own currency. Daily reference rates come
 * from the European Central Bank through Frankfurter (free, no key, no personal data sent). The
 * last good copy is kept in the database, so a failed fetch never breaks a page.
 */
export interface FxRates {
  /** Every rate is "1 base = rate × currency". */
  base: string
  /** The ECB publishing date the rates are for (YYYY-MM-DD). */
  date: string
  rates: Record<string, number>
  /** When Ledger last fetched them (ISO), or null if it never could. */
  fetchedAt: string | null
}

const KEY = 'fx_rates'
const MAX_AGE_MS = 6 * 60 * 60 * 1000
/** After a failure, wait this long before asking again so pages don't each pay for a timeout. */
const RETRY_AFTER_MS = 10 * 60 * 1000

let inflight: Promise<FxRates> | null = null
let lastFailure = 0

function cached(): FxRates | null {
  const raw = getSetting(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as FxRates
  } catch {
    return null
  }
}

async function fetchRates(): Promise<FxRates> {
  const res = await fetch(env.fxRatesUrl, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`rates request failed (${res.status})`)
  const body = (await res.json()) as { base?: unknown; date?: unknown; rates?: unknown }
  if (typeof body.base !== 'string' || typeof body.date !== 'string' || !body.rates || typeof body.rates !== 'object') {
    throw new Error('unexpected rates response')
  }
  const rates: Record<string, number> = { [body.base]: 1 }
  for (const [code, rate] of Object.entries(body.rates as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(code) && typeof rate === 'number' && rate > 0 && Number.isFinite(rate)) rates[code] = rate
  }
  const result: FxRates = { base: body.base, date: body.date, rates, fetchedAt: new Date().toISOString() }
  setSetting(KEY, JSON.stringify(result))
  return result
}

/** Current rates: the saved copy while it's fresh, otherwise a new fetch (falling back to the saved copy). */
export async function getRates(): Promise<FxRates> {
  const saved = cached()
  const fresh = saved?.fetchedAt && Date.now() - Date.parse(saved.fetchedAt) < MAX_AGE_MS
  if (saved && fresh) return saved
  if (Date.now() - lastFailure < RETRY_AFTER_MS) return saved ?? { base: 'EUR', date: '', rates: { EUR: 1 }, fetchedAt: null }
  inflight ??= fetchRates()
    .catch((err) => {
      lastFailure = Date.now()
      console.warn(`[fx] could not refresh exchange rates: ${err instanceof Error ? err.message : err}`)
      return saved ?? { base: 'EUR', date: '', rates: { EUR: 1 }, fetchedAt: null }
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** amount in `from` → `to`, or null when either currency has no rate. */
export function convert(amount: number, from: string, to: string, fx: FxRates): number | null {
  if (from === to) return amount
  const a = fx.rates[from]
  const b = fx.rates[to]
  if (!a || !b) return null
  return (amount / a) * b
}
