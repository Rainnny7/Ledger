import { addDays, isoDate } from "@/lib/format"
import { useUrlState } from "@/lib/url-state"

export const RANGES = {
  "30d": { label: "30D", days: 30 },
  "90d": { label: "90D", days: 90 },
  "6m": { label: "6M", days: 183 },
  "1y": { label: "1Y", days: 365 },
  "2y": { label: "2Y", days: 730 },
  "3y": { label: "3Y", days: 1095 },
  "4y": { label: "4Y", days: 1461 },
  all: { label: "All", days: null },
} as const
type PresetKey = keyof typeof RANGES

/** A preset, or a custom window of N days written as `${N}d` (e.g. "200d"). */
export type RangeKey = PresetKey | `${number}d`

export const MAX_CUSTOM_DAYS = 3650

export function customRange(days: number): RangeKey {
  return `${Math.min(MAX_CUSTOM_DAYS, Math.max(1, Math.round(days)))}d`
}

function isRangeKey(v: string): v is RangeKey {
  if (v in RANGES) return true
  const m = /^(\d{1,4})d$/.exec(v)
  return !!m && Number(m[1]) >= 1 && Number(m[1]) <= MAX_CUSTOM_DAYS
}

/** Length in days, or null for "All". */
export function rangeDays(r: RangeKey): number | null {
  return r in RANGES ? RANGES[r as PresetKey].days : parseInt(r, 10)
}

export function rangeLabel(r: RangeKey) {
  return r in RANGES ? RANGES[r as PresetKey].label : `${parseInt(r, 10)}D`
}

/** ISO start date for a range ('' = everything). Inclusive of today, so 30D is exactly 30 days. */
export function rangeStart(r: RangeKey) {
  const days = rangeDays(r)
  return days === null ? "" : addDays(isoDate(), -(days - 1))
}

/** URL-backed range that also accepts custom day counts; anything invalid falls back. */
export function useRangeState(key: string, fallback: RangeKey) {
  const [raw, set] = useUrlState<string>(key, fallback)
  const value = isRangeKey(raw) ? raw : fallback
  return [value, set as (r: RangeKey) => void] as const
}
