import { Hint } from "@/components/common/hint"
import { Loader2 } from "lucide-react"
import { CurrencySelect } from "@/components/common/currency-select"
import { GOAL_COLORS, accentStyle } from "@/components/goals/goal-meta"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { WorkJob } from "@/lib/api"
import { cn } from "cn"
import { FieldSelect } from "@/components/work/dialogs/field-select"
import { money } from "@/components/work/dialogs/form"
import {
  EVERY_ITEMS,
  type JobForm,
  useJobForm,
} from "@/components/work/dialogs/job-form"

type FormProps = { form: JobForm; set: (patch: Partial<JobForm>) => void }

export function WorkJobDialog({
  open,
  job,
  onClose,
}: {
  open: boolean
  job?: WorkJob | null
  onClose: () => void
}) {
  const { form, set, valid, saving, save } = useJobForm(open, job, onClose)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{job ? "Edit job" : "Add a job"}</DialogTitle>
          <DialogDescription>
            An hourly gig you bill yourself. Set how you usually get paid to see
            when it’ll be cleared.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="job-name">Name</Label>
            <Input
              id="job-name"
              value={form.name}
              maxLength={80}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Client or job name"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="job-currency">Paid in</Label>
              <CurrencySelect
                id="job-currency"
                value={form.currency}
                onChange={(currency) => set({ currency })}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="job-rate">Rate / hr</Label>
              <Input
                id="job-rate"
                inputMode="decimal"
                value={form.rate}
                onChange={(e) => set({ rate: money(e.target.value) })}
                placeholder="25.00"
                required
              />
            </div>
          </div>

          <PayScheduleFields form={form} set={set} />

          <ColourPicker
            value={form.color}
            onChange={(color) => set({ color })}
          />

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="job-notes">Notes</Label>
            <Textarea
              id="job-notes"
              value={form.notes}
              maxLength={500}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Who pays, where you send the bill…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {job ? "Save" : "Add job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The usual payment, how often it comes, and the day count for a custom schedule. */
function PayScheduleFields({ form, set }: FormProps) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="job-pay">Usual payment</Label>
          <Input
            id="job-pay"
            inputMode="decimal"
            value={form.payAmount}
            onChange={(e) => set({ payAmount: money(e.target.value) })}
            placeholder="250 (optional)"
          />
        </div>
        <FieldSelect
          label="How often"
          items={EVERY_ITEMS}
          value={form.every}
          onChange={(every) => set({ every })}
        />
      </div>
      {form.every === "custom" && (
        <div className="grid min-w-0 animate-in gap-2 duration-200 fade-in-0 slide-in-from-top-1">
          <Label htmlFor="job-days">Paid every (days)</Label>
          <Input
            id="job-days"
            inputMode="numeric"
            value={form.customDays}
            onChange={(e) =>
              set({ customDays: e.target.value.replace(/\D/g, "") })
            }
            className="w-28"
          />
        </div>
      )}
    </>
  )
}

/** A row of colour swatches to pick the job's accent from. */
function ColourPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label>Colour</Label>
      <div className="flex flex-wrap gap-2">
        {Object.entries(GOAL_COLORS).map(([key, c]) => (
          <Hint key={key} label={c.label}>
            <button
              type="button"
              aria-label={c.label}
              aria-pressed={value === key}
              onClick={() => onChange(key)}
              className={cn(
                "size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                value === key && "ring-2 ring-foreground/70"
              )}
              style={accentStyle(key)}
            />
          </Hint>
        ))}
      </div>
    </div>
  )
}
