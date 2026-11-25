import { DatePicker } from "@/components/date-picker"
import { Hint } from "@/components/hint"
import { Money } from "@/components/money"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { CurrencySelect } from "@/components/currency-select"
import { GOAL_COLORS, accentStyle } from "@/components/goal-bits"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, type WorkJob, type WorkJobInput } from "@/lib/api"
import { formatMoney, getDisplayCurrency, isoDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { EVERY_PRESETS, formatDuration, parseHours } from "@/lib/work"
import { fail, money, round2, validDate } from "@/components/work-form"
export {
  WorkInvoiceDialog,
  type InvoiceDraft,
} from "@/components/work-invoice-dialog"
export {
  WorkPaymentDialog,
  type WorkPaymentDraft,
} from "@/components/work-payment-dialog"

// ---------------------------------------------------------------- job

export function WorkJobDialog({
  open,
  job,
  onClose,
}: {
  open: boolean
  job?: WorkJob | null
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [rate, setRate] = useState("")
  const [currency, setCurrency] = useState(getDisplayCurrency)
  const [payAmount, setPayAmount] = useState("")
  const [every, setEvery] = useState("7")
  const [customDays, setCustomDays] = useState("10")
  const [color, setColor] = useState("ocean")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  // Fill the form each time it opens (not on every refetch of the job while it's open). Done
  // during render rather than in an effect, so the old values never flash.
  const formFor = open ? (job?.id ?? "new") : null
  const [filledFor, setFilledFor] = useState<string | null>(null)
  if (formFor !== filledFor) {
    setFilledFor(formFor)
    if (formFor !== null) {
      setName(job?.name ?? "")
      setRate(job ? String(job.rate) : "")
      setCurrency(job?.currency ?? getDisplayCurrency())
      setPayAmount(job?.payAmount ? String(job.payAmount) : "")
      const days = job?.payEveryDays ?? 7
      const preset = EVERY_PRESETS.some((p) => p.days === days)
      setEvery(
        job && !job.payEveryDays ? "none" : preset ? String(days) : "custom"
      )
      setCustomDays(preset ? "10" : String(days))
      setColor(job?.color ?? "ocean")
      setNotes(job?.notes ?? "")
    }
  }

  const rateN = Number(rate)
  const payN = Number(payAmount || 0)
  const days =
    every === "none"
      ? null
      : every === "custom"
        ? Number(customDays)
        : Number(every)
  const valid =
    name.trim().length > 0 &&
    Number.isFinite(rateN) &&
    rateN > 0 &&
    Number.isFinite(payN) &&
    payN >= 0 &&
    (days === null || (Number.isInteger(days) && days >= 1 && days <= 366))

  const everyItems = [
    ...EVERY_PRESETS.map((p) => ({ value: String(p.days), label: p.label })),
    { value: "custom", label: "Every … days" },
    { value: "none", label: "Whenever (no schedule)" },
  ]

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const body: WorkJobInput = {
      name: name.trim(),
      rate: round2(rateN),
      currency,
      payAmount: payN > 0 && days ? round2(payN) : null,
      payEveryDays: payN > 0 ? days : null,
      color,
      notes: notes.trim() || null,
    }
    try {
      if (job) await api.updateWorkJob(job.id, body)
      else await api.createWorkJob(body)
      toast.success(
        job ? "Job updated" : `Added ${body.name}`,
        job
          ? undefined
          : { description: "Log hours as you go, then bill them." }
      )
      onClose()
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

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
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
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
                value={currency}
                onChange={setCurrency}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="job-rate">Rate / hr</Label>
              <Input
                id="job-rate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(money(e.target.value))}
                placeholder="25.00"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="job-pay">Usual payment</Label>
              <Input
                id="job-pay"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(money(e.target.value))}
                placeholder="250 (optional)"
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label>How often</Label>
              <Select
                items={everyItems}
                value={every}
                onValueChange={(v) => v && setEvery(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {everyItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {every === "custom" && (
            <div className="grid min-w-0 animate-in gap-2 duration-200 fade-in-0 slide-in-from-top-1">
              <Label htmlFor="job-days">Paid every (days)</Label>
              <Input
                id="job-days"
                inputMode="numeric"
                value={customDays}
                onChange={(e) =>
                  setCustomDays(e.target.value.replace(/\D/g, ""))
                }
                className="w-28"
              />
            </div>
          )}

          <div className="grid min-w-0 gap-2">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(GOAL_COLORS).map(([key, c]) => (
                <Hint key={key} label={c.label}>
                  <button
                    type="button"
                    aria-label={c.label}
                    aria-pressed={color === key}
                    onClick={() => setColor(key)}
                    className={cn(
                      "size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                      color === key && "ring-2 ring-foreground/70"
                    )}
                    style={accentStyle(key)}
                  />
                </Hint>
              ))}
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="job-notes">Notes</Label>
            <Textarea
              id="job-notes"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
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

// ---------------------------------------------------------------- log a shift

export function WorkEntryDialog({
  job,
  onClose,
}: {
  job: WorkJob | null
  onClose: () => void
}) {
  const [hours, setHours] = useState("")
  const [date, setDate] = useState(isoDate())
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  // A fresh form each time it opens for a job.
  const [filledFor, setFilledFor] = useState<string | null>(null)
  if ((job?.id ?? null) !== filledFor) {
    setFilledFor(job?.id ?? null)
    if (job) {
      setHours("")
      setDate(isoDate())
      setNote("")
    }
  }

  const parsed = parseHours(hours)
  const valid =
    parsed !== null && parsed > 0 && parsed <= 10_000 && validDate(date)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!job || !valid) return
    setSaving(true)
    try {
      const { job: updated } = await api.addWorkEntry(job.id, {
        date,
        hours: round2(parsed),
        note: note.trim() || null,
      })
      toast.success(`Logged ${formatDuration(parsed)}`, {
        description: `${formatDuration(updated.unbilledHours)} not billed yet · ${formatMoney(updated.unbilledValue, updated.currency)}`,
      })
      onClose()
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log hours</DialogTitle>
          <DialogDescription>
            {job?.name} · they’ll go on your next bill.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="entry-hours">Hours</Label>
            <Input
              id="entry-hours"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="3.5, 3:30 or 3h 30m"
              className="h-11 text-lg tabular-nums"
              required
              autoFocus
            />
            <p className="h-4 text-xs text-muted-foreground">
              {parsed !== null && parsed > 0 && job && (
                <>
                  {formatDuration(parsed)} ·{" "}
                  <Money value={parsed * job.rate} currency={job.currency} />
                </>
              )}
              {hours && parsed === null && (
                <span className="text-destructive">
                  Try 3.5, 3:30 or 3h 30m
                </span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="entry-date">Date</Label>
              <DatePicker
                id="entry-date"
                value={date}
                max={isoDate()}
                onChange={setDate}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="entry-note">Note</Label>
              <Input
                id="entry-note"
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              Log hours
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
