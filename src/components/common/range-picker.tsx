import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  customRange,
  MAX_CUSTOM_DAYS,
  rangeLabel,
  type RangeKey,
} from "@/lib/ranges"

const MORE_VALUE = "more"
const MORE: RangeKey[] = ["2y", "3y", "4y"]

const UNITS = [
  { value: "days", label: "Days", perUnit: 1 },
  { value: "months", label: "Months", perUnit: 30.44 },
  { value: "years", label: "Years", perUnit: 365 },
] as const
type Unit = (typeof UNITS)[number]["value"]

export function RangePicker({
  value,
  onChange,
  options = ["30d", "90d", "6m", "1y", "all"],
}: {
  value: RangeKey
  onChange: (r: RangeKey) => void
  options?: RangeKey[]
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const inMore = !options.includes(value)

  return (
    <>
      <ToggleGroup
        size="sm"
        variant="outline"
        spacing={0}
        value={[value]}
        onValueChange={(v: string[]) =>
          v[0] && v[0] !== MORE_VALUE && onChange(v[0] as RangeKey)
        }
        aria-label="Time range"
      >
        {options.map((k) => (
          <ToggleGroupItem key={k} value={k} className="px-2.5 tabular-nums">
            {rangeLabel(k)}
          </ToggleGroupItem>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <ToggleGroupItem
                value={inMore ? value : MORE_VALUE}
                aria-label="More time ranges"
                className="gap-1 rounded-r-lg! px-2.5 tabular-nums"
              />
            }
          >
            {inMore ? rangeLabel(value) : "More"}
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            {MORE.map((k) => (
              <DropdownMenuItem key={k} onClick={() => onChange(k)}>
                {rangeLabel(k)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCustomOpen(true)}>
              Custom range
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToggleGroup>
      <CustomRangeDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        onApply={(r) => {
          onChange(r)
          setCustomOpen(false)
        }}
      />
    </>
  )
}

function CustomRangeDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (r: RangeKey) => void
}) {
  const [amount, setAmount] = useState("18")
  const [unit, setUnit] = useState<Unit>("months")
  const perUnit = UNITS.find((u) => u.value === unit)!.perUnit
  const n = Number(amount)
  const days = Math.round(n * perUnit)
  const valid =
    Number.isFinite(n) && n > 0 && days >= 1 && days <= MAX_CUSTOM_DAYS

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Custom range</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) onApply(customRange(days))
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Last</span>
            <Input
              type="number"
              min={1}
              step="any"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-20"
              aria-label="Amount"
            />
            <Select
              items={UNITS}
              value={unit}
              onValueChange={(v) => v && setUnit(v as Unit)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!valid && (
            <p className="text-xs text-destructive">
              Enter a range between 1 day and 10 years.
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!valid}>
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
