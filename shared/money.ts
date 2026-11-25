/**
 * Money is stored and added up as integer cents (scale 100 for every currency). The JSON API and
 * the UI still speak decimal amounts ("12.34"); `toCents` / `fromCents` are the only crossing
 * points. FX rates, hours and quantities stay floats: they are multiplied in, then rounded back
 * to a whole cent exactly once.
 */

/** Largest amount (in cents) that survives float math without losing a cent. */
const MAX_CENTS = Number.MAX_SAFE_INTEGER

/** Round half away from zero (what SQLite's ROUND does, so SQL and JS agree). */
function roundHalfAway(n: number) {
  return n < 0 ? -Math.round(-n) : Math.round(n)
}

/** Snap a float to `places` decimal digits (hours, quantities, etc.). */
export function roundTo(n: number, places: number): number {
  if (!Number.isFinite(n)) throw new RangeError(`Not a number: ${n}`)
  if (!Number.isInteger(places) || places < 0)
    throw new RangeError(`Invalid places: ${places}`)
  const scale = 10 ** places
  return roundHalfAway(Number.parseFloat((n * scale).toPrecision(15))) / scale
}

/**
 * Decimal amount → whole cents. `.toPrecision(15)` first strips binary noise so 1.005 → 101 and
 * 0.1 + 0.2 → 30 instead of rounding down on a 100.49999999999999.
 */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount))
    throw new RangeError(`Not a money amount: ${amount}`)
  const cents = roundHalfAway(Number.parseFloat((amount * 100).toPrecision(15)))
  if (Math.abs(cents) > MAX_CENTS)
    throw new RangeError(`Money amount too large: ${amount}`)
  return cents === 0 ? 0 : cents // no -0
}

/** Whole cents → decimal amount for the API. */
export function fromCents(cents: number): number {
  return cents / 100
}

/** Same as `fromCents`, but passes null through (optional columns). */
export function fromCentsOrNull(
  cents: number | null | undefined
): number | null {
  return cents === null || cents === undefined ? null : fromCents(cents)
}

/** Same as `toCents`, but passes null/undefined through as null (optional columns). */
export function toCentsOrNull(
  amount: number | null | undefined
): number | null {
  return amount === null || amount === undefined ? null : toCents(amount)
}

/** Snap a decimal to a whole cent (absorbs float noise like 0.1 + 0.2). */
export function roundMoney(amount: number): number {
  return fromCents(toCents(amount))
}

/** Sum of decimal amounts, added as cents. */
export function sumMoney(amounts: Iterable<number>): number {
  let cents = 0
  for (const a of amounts) cents += toCents(a)
  return fromCents(cents)
}

/** `cents × factor` (hours, quantity, rate, percent/100…), rounded to a whole cent once. */
export function mulCents(cents: number, factor: number): number {
  if (!Number.isFinite(factor)) throw new RangeError(`Not a number: ${factor}`)
  return roundHalfAway(Number.parseFloat((cents * factor).toPrecision(15)))
}

/** Decimal price × quantity/hours → decimal amount, rounded to a cent once. */
export function mulMoney(amount: number, factor: number): number {
  return fromCents(mulCents(toCents(amount), factor))
}

/** Cents in one currency → another, given each currency's rate against a common base. */
export function convertCents(
  cents: number,
  fromRate: number,
  toRate: number
): number {
  if (!(fromRate > 0) || !(toRate > 0))
    throw new RangeError("FX rates must be positive")
  return mulCents(cents, toRate / fromRate)
}

/**
 * Split `total` cents across `weights` (largest remainder), so the parts always add back up to
 * the total, to the cent. Ties go to the earlier part. Works for negative totals too.
 */
export function allocateCents(
  total: number,
  weights: readonly number[]
): number[] {
  if (!Number.isInteger(total))
    throw new RangeError("allocateCents takes whole cents")
  if (weights.length === 0) throw new RangeError("Nothing to allocate to")
  if (weights.some((w) => !Number.isFinite(w) || w < 0))
    throw new RangeError("Weights must be non-negative numbers")
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0) throw new RangeError("Weights must not all be zero")
  const sign = total < 0 ? -1 : 1
  const abs = Math.abs(total)
  const exact = weights.map((w) => (abs * w) / sum)
  const parts = exact.map(Math.floor)
  let left = abs - parts.reduce((s, p) => s + p, 0)
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .toSorted((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    parts[i]! += 1
    left -= 1
  }
  return parts.map((p) => (p === 0 ? 0 : sign * p))
}

/** Split `total` cents into `n` near-equal parts that add back up exactly. */
export function splitCents(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1)
    throw new RangeError("Split into at least one part")
  return allocateCents(
    total,
    Array.from({ length: n }, () => 1)
  )
}
