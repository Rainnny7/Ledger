import { addDays, isoDate } from "@/lib/format"
import { useUrlState } from "@/lib/url-state"

/** Preset transaction windows used on Insights and related pages. */
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

/** Upper bound for custom `Nd` ranges in the URL. */
export const MAX_CUSTOM_DAYS = 3650

/** Clamp and format a day count as a custom range key. */
export function customRange(days: number): RangeKey {
	return `${Math.min(MAX_CUSTOM_DAYS, Math.max(1, Math.round(days)))}d`
}

function isRangeKey(value: string): value is RangeKey {
	if (value in RANGES) {
		return true
	}
	const match = /^(\d{1,4})d$/.exec(value)
	return (
		!!match && Number(match[1]) >= 1 && Number(match[1]) <= MAX_CUSTOM_DAYS
	)
}

/** Length in days, or null for "All". */
export function rangeDays(rangeKey: RangeKey): number | null {
	return rangeKey in RANGES
		? RANGES[rangeKey as PresetKey].days
		: parseInt(rangeKey, 10)
}

/** Short label for the range picker (presets or `ND`). */
export function rangeLabel(rangeKey: RangeKey) {
	return rangeKey in RANGES
		? RANGES[rangeKey as PresetKey].label
		: `${parseInt(rangeKey, 10)}D`
}

/** ISO start date for a range ('' = everything). Inclusive of today, so 30D is exactly 30 days. */
export function rangeStart(rangeKey: RangeKey) {
	const days = rangeDays(rangeKey)
	return days === null ? "" : addDays(isoDate(), -(days - 1))
}

/** URL-backed range that also accepts custom day counts; anything invalid falls back. */
export function useRangeState(key: string, fallback: RangeKey) {
	const [raw, set] = useUrlState<string>(key, fallback)
	const value = isRangeKey(raw) ? raw : fallback
	return [value, set as (rangeKey: RangeKey) => void] as const
}
