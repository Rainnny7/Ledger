import { DatePicker } from "@/components/date-picker"
import { Money } from "@/components/money"
import { Clock, Loader2, Timer } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, type WorkInvoice, type WorkJob } from "@/lib/api"
import { formatMoney, formatShortDate, isoDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { formatDuration, formatHours, hoursInput, parseHours } from "@/lib/work"
import { fail, money, round2, validDate } from "@/components/work-form"

export interface InvoiceDraft {
  job: WorkJob
  /** Edit this bill; otherwise create one. */
  invoice?: WorkInvoice
}

export function WorkInvoiceDialog({
  draft,
  onClose,
}: {
  draft: InvoiceDraft | null
  onClose: () => void
}) {
  const job = draft?.job
  const editing = draft?.invoice
  const [mode, setMode] = useState<"hours" | "tracker">("hours")
  const [hours, setHours] = useState("")
  const [counter, setCounter] = useState("")
  const [rate, setRate] = useState("")
  const [total, setTotal] = useState("")
  const [totalTouched, setTotalTouched] = useState(false)
  const [includeShifts, setIncludeShifts] = useState(true)
  const [date, setDate] = useState(isoDate())
  const [proof, setProof] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  // The tracker reading the last bill left off at (excluding the bill being edited).
  const lastCounter = useMemo(() => {
    if (!job) return null
    const prior = job.invoices.filter(
      (i) =>
        i.id !== editing?.id &&
        i.counterHours !== null &&
        (!editing || i.date <= editing.date)
    )
    return prior[0]?.counterHours ?? null
  }, [job, editing])

  // Fill the form from each new draft, during render so the old values never flash.
  const [filledFrom, setFilledFrom] = useState<typeof draft>(null)
  if (draft !== filledFrom) {
    setFilledFrom(draft)
    if (draft) {
      const { job, invoice } = draft
      setMode(
        invoice
          ? invoice.counterHours !== null
            ? "tracker"
            : "hours"
          : job.lastCounter !== null && job.unbilledHours === 0
            ? "tracker"
            : "hours"
      )
      setHours(
        invoice
          ? hoursInput(invoice.hours)
          : job.unbilledHours > 0
            ? hoursInput(job.unbilledHours)
            : ""
      )
      setCounter(
        invoice?.counterHours != null ? hoursInput(invoice.counterHours) : ""
      )
      setRate(String(invoice?.rate ?? job.rate))
      setTotal(invoice ? String(invoice.total) : "")
      setTotalTouched(
        !!invoice &&
          Math.abs(invoice.total - round2(invoice.hours * invoice.rate)) > 0.005
      )
      setIncludeShifts(true)
      setDate(invoice?.date ?? isoDate())
      setProof(invoice?.proofUrl ?? "")
      setNote(invoice?.note ?? "")
    }
  }

  const counterN = parseHours(counter)
  const hoursN =
    mode === "tracker"
      ? counterN !== null && lastCounter !== null
        ? round2(counterN - lastCounter)
        : counterN !== null && lastCounter === null
          ? parseHours(hours)
          : null
      : parseHours(hours)
  const rateN = Number(rate)
  const autoTotal =
    hoursN !== null && Number.isFinite(rateN) ? round2(hoursN * rateN) : null
  const totalN = totalTouched ? Number(total) : autoTotal
  const shifts = !editing && job ? job.unbilled : []
  const proofOk = !proof.trim() || /^https?:\/\/\S+$/i.test(proof.trim())
  const valid =
    hoursN !== null &&
    hoursN > 0 &&
    Number.isFinite(rateN) &&
    rateN > 0 &&
    totalN !== null &&
    Number.isFinite(totalN) &&
    totalN >= 0 &&
    validDate(date) &&
    proofOk &&
    (mode === "hours" || counterN !== null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!job || !valid || hoursN === null || totalN === null) return
    setSaving(true)
    // In hours mode, keep the tracker count rolling if one is being kept.
    const counterHours =
      mode === "tracker"
        ? round2(counterN!)
        : lastCounter !== null
          ? round2(lastCounter + hoursN)
          : null
    const body = {
      date,
      hours: round2(hoursN),
      rate: round2(rateN),
      total: round2(totalN),
      counterHours,
      proofUrl: proof.trim() || null,
      note: note.trim() || null,
    }
    try {
      if (editing) {
        await api.updateWorkInvoice(editing.id, body)
        toast.success("Bill updated")
      } else {
        await api.createWorkInvoice(job.id, {
          ...body,
          entryIds: includeShifts ? shifts.map((s) => s.id) : [],
        })
        toast.success(`Billed ${formatMoney(body.total, job.currency)}`, {
          description: `${formatDuration(body.hours)} for ${job.name}`,
        })
      }
      onClose()
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit bill" : "Bill your hours"}</DialogTitle>
          <DialogDescription>
            {editing
              ? job?.name
              : `What you’re owed for ${job?.name ?? "this job"} since you last billed.`}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
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
                className={cn(
                  mode === "hours" && "h-11 text-lg",
                  "tabular-nums"
                )}
                autoFocus={mode === "hours"}
              />
              {hours && parseHours(hours) === null && (
                <p className="text-xs text-destructive">
                  Try 63, 43.6 or 43h 36m
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="inv-rate">Rate / hr</Label>
              <Input
                id="inv-rate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(money(e.target.value))}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="inv-total">Total</Label>
                {totalTouched && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setTotalTouched(false)}
                  >
                    Use rate
                  </button>
                )}
              </div>
              <Input
                id="inv-total"
                inputMode="decimal"
                value={
                  totalTouched
                    ? total
                    : autoTotal !== null
                      ? String(autoTotal)
                      : ""
                }
                onChange={(e) => {
                  setTotalTouched(true)
                  setTotal(money(e.target.value))
                }}
                className="font-medium tabular-nums"
              />
            </div>
          </div>
          {totalTouched &&
            autoTotal !== null &&
            totalN !== null &&
            Math.abs(totalN - autoTotal) > 0.005 && (
              <p className="-mt-2 text-xs text-muted-foreground">
                Agreed total —{" "}
                <Money value={autoTotal} currency={job?.currency} /> at the
                hourly rate.
              </p>
            )}

          {shifts.length > 0 && (
            <label className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm">
              <Checkbox
                checked={includeShifts}
                onCheckedChange={(v) => setIncludeShifts(v === true)}
                className="mt-0.5"
              />
              <span>
                Put my {shifts.length} logged shift
                {shifts.length === 1 ? "" : "s"} on this bill
                <span className="block text-xs text-muted-foreground">
                  {formatDuration(job!.unbilledHours)} since{" "}
                  {formatShortDate(shifts.at(-1)!.date)}
                </span>
              </span>
            </label>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="inv-date">Billed on</Label>
              <DatePicker id="inv-date" value={date} onChange={setDate} />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="inv-proof">Proof link</Label>
              <Input
                id="inv-proof"
                type="url"
                value={proof}
                maxLength={500}
                onChange={(e) => setProof(e.target.value)}
                placeholder="https://…screenshot"
                aria-invalid={!proofOk}
              />
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="inv-note">Note</Label>
            <Input
              id="inv-note"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {editing
                ? "Save"
                : totalN
                  ? `Bill ${formatMoney(totalN, job?.currency)}`
                  : "Bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
