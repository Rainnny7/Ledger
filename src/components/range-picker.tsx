import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { addDays, isoDate } from "@/lib/format"

export const RANGES = {
  "30d": { label: "30D", days: 30 },
  "90d": { label: "90D", days: 90 },
  "6m": { label: "6M", days: 183 },
  "1y": { label: "1Y", days: 365 },
  all: { label: "All", days: null },
} as const
export type RangeKey = keyof typeof RANGES

/** ISO start date for a range ('' = everything). Inclusive of today, so 30D is exactly 30 days. */
export function rangeStart(r: RangeKey) {
  const days = RANGES[r].days
  return days === null ? "" : addDays(isoDate(), -(days - 1))
}

export function RangePicker({
  value,
  onChange,
  options = ["30d", "90d", "6m", "1y", "all"],
}: {
  value: RangeKey
  onChange: (r: RangeKey) => void
  options?: RangeKey[]
}) {
  return (
    <ToggleGroup
      size="sm"
      variant="outline"
      spacing={0}
      value={[value]}
      onValueChange={(v: string[]) => v[0] && onChange(v[0] as RangeKey)}
      aria-label="Time range"
    >
      {options.map((k) => (
        <ToggleGroupItem key={k} value={k} className="px-2.5 tabular-nums">
          {RANGES[k].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
