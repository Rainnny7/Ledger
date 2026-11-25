import type { useWorkInvoiceDialog } from "@/components/work/dialogs/use-work-invoice-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatHours, parseHours } from "@/lib/work"
import { cn } from "cn"
import { Clock, Timer } from "lucide-react"

type Model = ReturnType<typeof useWorkInvoiceDialog>

export function InvoiceDialogHours({ model }: { model: Model }) {
  const {
    mode,
    setMode,
    hours,
    setHours,
    counter,
    setCounter,
    lastCounter,
    counterN,
    hoursN,
  } = model

  return (
    <>
      <ToggleGroup
        value={[mode]}
        onValueChange={(v) => v[0] && setMode(v[0] as "hours" | "tracker")}
        variant="outline"
        className="w-full"
      >
        <ToggleGroupItem value="hours" className="flex-1">
          <Clock /> Hours worked
        </ToggleGroupItem>
        <ToggleGroupItem value="tracker" className="flex-1">
          <Timer /> Tracker total
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === "tracker" && (
        <div className="grid min-w-0 animate-in gap-2 duration-200 fade-in-0">
          <Label htmlFor="inv-counter">Tracker now reads</Label>
          <Input
            id="inv-counter"
            value={counter}
            onChange={(e) => setCounter(e.target.value)}
            placeholder="120h 30m or 120.5"
            className="h-11 text-lg tabular-nums"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {lastCounter !== null ? (
              <>
                Last bill left off at {formatHours(lastCounter)} hrs
                {counterN !== null && hoursN !== null && (
                  <span
                    className={cn(
                      "font-medium",
                      hoursN > 0 ? "text-foreground" : "text-destructive"
                    )}
                  >
                    {" "}
                    → {formatHours(hoursN)} hours since
                  </span>
                )}
              </>
            ) : (
              "First tracked bill — enter the hours worked below too."
            )}
          </p>
        </div>
      )}

      {(mode === "hours" || lastCounter === null) && (
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="inv-hours">Hours since last pay</Label>
          <Input
            id="inv-hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="63 or 43h 36m"
            className={cn(mode === "hours" && "h-11 text-lg", "tabular-nums")}
            autoFocus={mode === "hours"}
          />
          {hours && parseHours(hours) === null && (
            <p className="text-xs text-destructive">Try 63, 43.6 or 43h 36m</p>
          )}
        </div>
      )}
    </>
  )
}
