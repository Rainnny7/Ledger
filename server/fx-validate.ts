import { z } from "zod"
import type { FxRates } from "./fx.ts"

const ISO_CODES = new Set(Intl.supportedValuesOf("currency"))

const MAJOR = ["USD", "EUR", "GBP", "CAD", "JPY", "CHF", "AUD"] as const

const MAX_DAY_JUMP = 0.5
const MIN_COVERAGE_RATIO = 0.5

const ratesBodySchema = z.record(z.string(), z.union([z.number(), z.string()]))

/** Rejects implausible FX payloads; throws when the feed should not replace the saved set. */
export function validateFxRates(next: FxRates, previous: FxRates | null) {
  const base = next.base.toUpperCase()
  if (base.length !== 3 || !ISO_CODES.has(base))
    throw new Error("FX base currency is not a supported ISO code")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.date))
    throw new Error("FX date is not YYYY-MM-DD")
  const parsed = ratesBodySchema.safeParse(next.rates)
  if (!parsed.success) throw new Error("FX rates are not a currency map")
  const count = Object.keys(next.rates).length
  if (count < 2) throw new Error("FX feed returned too few currencies")
  for (const [code, rate] of Object.entries(next.rates)) {
    if (!ISO_CODES.has(code))
      throw new Error(`FX rate uses unsupported code ${code}`)
    if (!(rate > 0) || !Number.isFinite(rate))
      throw new Error(`FX rate for ${code} is not a positive finite number`)
  }
  if (previous) {
    const prevCount = Object.keys(previous.rates).length
    const minRequired = Math.max(2, Math.floor(prevCount * MIN_COVERAGE_RATIO))
    if (count < minRequired)
      throw new Error(
        `FX feed covers ${count} currencies, need at least ${minRequired} (half of ${prevCount})`
      )
    for (const code of MAJOR) {
      const before = previous.rates[code]
      const after = next.rates[code]
      if (before && after) {
        const jump = Math.abs(after - before) / before
        if (jump > MAX_DAY_JUMP)
          throw new Error(
            `FX ${code} moved ${(jump * 100).toFixed(0)}% day-over-day`
          )
      }
    }
  }
}
