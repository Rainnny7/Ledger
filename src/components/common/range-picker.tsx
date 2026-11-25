import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { RANGES, type RangeKey } from "@/lib/ranges"

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
