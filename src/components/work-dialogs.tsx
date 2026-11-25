import { DatePicker } from '@/components/date-picker'
import { Hint } from '@/components/hint'
import { Money } from '@/components/money'
import { Clock, Copy, Loader2, Timer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CurrencySelect } from '@/components/currency-select'
import { GOAL_COLORS, accentStyle } from '@/components/goal-bits'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api, type WorkInvoice, type WorkJob, type WorkJobInput } from '@/lib/api'
import { convertAmount, useFx } from '@/lib/currency'
import { formatMoney, formatShortDate, getDisplayCurrency, isoDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { copyText, EVERY_PRESETS, formatDuration, formatHours, hoursInput, parseHours, paymentLine } from '@/lib/work'

const money = (s: string) => s.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
const round2 = (n: number) => Math.round(n * 100) / 100
const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
const fail = (err: unknown) => toast.error((err as Error).message)

// ---------------------------------------------------------------- job

export function WorkJobDialog({ open, job, onClose }: { open: boolean; job?: WorkJob | null; onClose: () => void }) {
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [currency, setCurrency] = useState(getDisplayCurrency)
  const [payAmount, setPayAmount] = useState('')
  const [every, setEvery] = useState('7')
  const [customDays, setCustomDays] = useState('10')
  const [color, setColor] = useState('ocean')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(job?.name ?? '')
    setRate(job ? String(job.rate) : '')
    setCurrency(job?.currency ?? getDisplayCurrency())
    setPayAmount(job?.payAmount ? String(job.payAmount) : '')
    const days = job?.payEveryDays ?? 7
    const preset = EVERY_PRESETS.some((p) => p.days === days)
    setEvery(job && !job.payEveryDays ? 'none' : preset ? String(days) : 'custom')
    setCustomDays(preset ? '10' : String(days))
    setColor(job?.color ?? 'ocean')
    setNotes(job?.notes ?? '')
  }, [open, job])

  const rateN = Number(rate)
  const payN = Number(payAmount || 0)
  const days = every === 'none' ? null : every === 'custom' ? Number(customDays) : Number(every)
  const valid =
    name.trim().length > 0 &&
    Number.isFinite(rateN) &&
    rateN > 0 &&
    Number.isFinite(payN) &&
    payN >= 0 &&
    (days === null || (Number.isInteger(days) && days >= 1 && days <= 366))

  const everyItems = [
    ...EVERY_PRESETS.map((p) => ({ value: String(p.days), label: p.label })),
    { value: 'custom', label: 'Every … days' },
    { value: 'none', label: 'Whenever (no schedule)' },
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
      toast.success(job ? 'Job updated' : `Added ${body.name}`, job ? undefined : { description: 'Log hours as you go, then bill them.' })
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
          <DialogTitle>{job ? 'Edit job' : 'Add a job'}</DialogTitle>
          <DialogDescription>An hourly gig you bill yourself. Set how you usually get paid to see when it’ll be cleared.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="job-name">Name</Label>
            <Input id="job-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Client or job name" required autoFocus />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="job-currency">Paid in</Label>
              <CurrencySelect id="job-currency" value={currency} onChange={setCurrency} />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="job-rate">Rate / hr</Label>
              <Input id="job-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(money(e.target.value))} placeholder="25.00" required />
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="job-pay">Usual payment</Label>
              <Input id="job-pay" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(money(e.target.value))} placeholder="250 (optional)" />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label>How often</Label>
              <Select items={everyItems} value={every} onValueChange={(v) => v && setEvery(v)}>
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
          {every === 'custom' && (
            <div className="grid min-w-0 gap-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
              <Label htmlFor="job-days">Paid every (days)</Label>
              <Input id="job-days" inputMode="numeric" value={customDays} onChange={(e) => setCustomDays(e.target.value.replace(/\D/g, ''))} className="w-28" />
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
                  className={cn('size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110', color === key && 'ring-2 ring-foreground/70')}
                  style={accentStyle(key)}
                />
                </Hint>
              ))}
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="job-notes">Notes</Label>
            <Textarea id="job-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Who pays, where you send the bill…" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {job ? 'Save' : 'Add job'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- log a shift

export function WorkEntryDialog({ job, onClose }: { job: WorkJob | null; onClose: () => void }) {
  const [hours, setHours] = useState('')
  const [date, setDate] = useState(isoDate())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!job) return
    setHours('')
    setDate(isoDate())
    setNote('')
  }, [job])

  const parsed = parseHours(hours)
  const valid = parsed !== null && parsed > 0 && parsed <= 10_000 && validDate(date)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!job || !valid) return
    setSaving(true)
    try {
      const { job: updated } = await api.addWorkEntry(job.id, { date, hours: round2(parsed), note: note.trim() || null })
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
          <DialogDescription>{job?.name} · they’ll go on your next bill.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="entry-hours">Hours</Label>
            <Input id="entry-hours" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="3.5, 3:30 or 3h 30m" className="h-11 text-lg tabular-nums" required autoFocus />
            <p className="h-4 text-xs text-muted-foreground">
              {parsed !== null && parsed > 0 && job && `${formatDuration(parsed)} · ${formatMoney(parsed * job.rate, job.currency)}`}
              {hours && parsed === null && <span className="text-destructive">Try 3.5, 3:30 or 3h 30m</span>}
            </p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="entry-date">Date</Label>
              <DatePicker id="entry-date" value={date} max={isoDate()} onChange={setDate} />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="entry-note">Note</Label>
              <Input id="entry-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
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

// ---------------------------------------------------------------- bill

export interface InvoiceDraft {
  job: WorkJob
  /** Edit this bill; otherwise create one. */
  invoice?: WorkInvoice
}

export function WorkInvoiceDialog({ draft, onClose }: { draft: InvoiceDraft | null; onClose: () => void }) {
  const job = draft?.job
  const editing = draft?.invoice
  const [mode, setMode] = useState<'hours' | 'tracker'>('hours')
  const [hours, setHours] = useState('')
  const [counter, setCounter] = useState('')
  const [rate, setRate] = useState('')
  const [total, setTotal] = useState('')
  const [totalTouched, setTotalTouched] = useState(false)
  const [includeShifts, setIncludeShifts] = useState(true)
  const [date, setDate] = useState(isoDate())
  const [proof, setProof] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // The tracker reading the last bill left off at (excluding the bill being edited).
  const lastCounter = useMemo(() => {
    if (!job) return null
    const prior = job.invoices.filter((i) => i.id !== editing?.id && i.counterHours !== null && (!editing || i.date <= editing.date))
    return prior[0]?.counterHours ?? null
  }, [job, editing])

  useEffect(() => {
    if (!draft) return
    const { job, invoice } = draft
    setMode(invoice ? (invoice.counterHours !== null ? 'tracker' : 'hours') : job.lastCounter !== null && job.unbilledHours === 0 ? 'tracker' : 'hours')
    setHours(invoice ? hoursInput(invoice.hours) : job.unbilledHours > 0 ? hoursInput(job.unbilledHours) : '')
    setCounter(invoice?.counterHours != null ? hoursInput(invoice.counterHours) : '')
    setRate(String(invoice?.rate ?? job.rate))
    setTotal(invoice ? String(invoice.total) : '')
    setTotalTouched(!!invoice && Math.abs(invoice.total - round2(invoice.hours * invoice.rate)) > 0.005)
    setIncludeShifts(true)
    setDate(invoice?.date ?? isoDate())
    setProof(invoice?.proofUrl ?? '')
    setNote(invoice?.note ?? '')
  }, [draft])

  const counterN = parseHours(counter)
  const hoursN =
    mode === 'tracker' ? (counterN !== null && lastCounter !== null ? round2(counterN - lastCounter) : counterN !== null && lastCounter === null ? parseHours(hours) : null) : parseHours(hours)
  const rateN = Number(rate)
  const autoTotal = hoursN !== null && Number.isFinite(rateN) ? round2(hoursN * rateN) : null
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
    (mode === 'hours' || counterN !== null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!job || !valid || hoursN === null || totalN === null) return
    setSaving(true)
    // In hours mode, keep the tracker count rolling if one is being kept.
    const counterHours =
      mode === 'tracker' ? round2(counterN!) : lastCounter !== null ? round2(lastCounter + hoursN) : null
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
        toast.success('Bill updated')
      } else {
        await api.createWorkInvoice(job.id, { ...body, entryIds: includeShifts ? shifts.map((s) => s.id) : [] })
        toast.success(`Billed ${formatMoney(body.total, job.currency)}`, { description: `${formatDuration(body.hours)} for ${job.name}` })
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
          <DialogTitle>{editing ? 'Edit bill' : 'Bill your hours'}</DialogTitle>
          <DialogDescription>
            {editing ? job?.name : `What you’re owed for ${job?.name ?? 'this job'} since you last billed.`}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <ToggleGroup value={[mode]} onValueChange={(v) => v[0] && setMode(v[0] as 'hours' | 'tracker')} variant="outline" className="w-full">
            <ToggleGroupItem value="hours" className="flex-1">
              <Clock /> Hours worked
            </ToggleGroupItem>
            <ToggleGroupItem value="tracker" className="flex-1">
              <Timer /> Tracker total
            </ToggleGroupItem>
          </ToggleGroup>

          {mode === 'tracker' && (
            <div className="grid min-w-0 gap-2 animate-in fade-in-0 duration-200">
              <Label htmlFor="inv-counter">Tracker now reads</Label>
              <Input id="inv-counter" value={counter} onChange={(e) => setCounter(e.target.value)} placeholder="120h 30m or 120.5" className="h-11 text-lg tabular-nums" autoFocus />
              <p className="text-xs text-muted-foreground">
                {lastCounter !== null ? (
                  <>
                    Last bill left off at {formatHours(lastCounter)} hrs
                    {counterN !== null && hoursN !== null && (
                      <span className={cn('font-medium', hoursN > 0 ? 'text-foreground' : 'text-destructive')}> → {formatHours(hoursN)} hours since</span>
                    )}
                  </>
                ) : (
                  'First tracked bill — enter the hours worked below too.'
                )}
              </p>
            </div>
          )}

          {(mode === 'hours' || lastCounter === null) && (
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="inv-hours">Hours since last pay</Label>
              <Input
                id="inv-hours"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="63 or 43h 36m"
                className={cn(mode === 'hours' && 'h-11 text-lg', 'tabular-nums')}
                autoFocus={mode === 'hours'}
              />
              {hours && parseHours(hours) === null && <p className="text-xs text-destructive">Try 63, 43.6 or 43h 36m</p>}
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="inv-rate">Rate / hr</Label>
              <Input id="inv-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(money(e.target.value))} />
            </div>
            <div className="grid min-w-0 gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="inv-total">Total</Label>
                {totalTouched && (
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setTotalTouched(false)}>
                    Use rate
                  </button>
                )}
              </div>
              <Input
                id="inv-total"
                inputMode="decimal"
                value={totalTouched ? total : autoTotal !== null ? String(autoTotal) : ''}
                onChange={(e) => {
                  setTotalTouched(true)
                  setTotal(money(e.target.value))
                }}
                className="font-medium tabular-nums"
              />
            </div>
          </div>
          {totalTouched && autoTotal !== null && totalN !== null && Math.abs(totalN - autoTotal) > 0.005 && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Agreed total — <Money value={autoTotal} currency={job?.currency} /> at the hourly rate.
            </p>
          )}

          {shifts.length > 0 && (
            <label className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm">
              <Checkbox checked={includeShifts} onCheckedChange={(v) => setIncludeShifts(v === true)} className="mt-0.5" />
              <span>
                Put my {shifts.length} logged shift{shifts.length === 1 ? '' : 's'} on this bill
                <span className="block text-xs text-muted-foreground">
                  {formatDuration(job!.unbilledHours)} since {formatShortDate(shifts.at(-1)!.date)}
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
              <Input id="inv-proof" type="url" value={proof} maxLength={500} onChange={(e) => setProof(e.target.value)} placeholder="https://…screenshot" aria-invalid={!proofOk} />
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="inv-note">Note</Label>
            <Input id="inv-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? 'Save' : totalN ? `Bill ${formatMoney(totalN, job?.currency)}` : 'Bill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- payment

export interface WorkPaymentDraft {
  job: WorkJob
  invoiceId?: string
  amount?: number
  date?: string
  note?: string
  transactionId?: string
}

export function WorkPaymentDialog({ draft, onClose }: { draft: WorkPaymentDraft | null; onClose: () => void }) {
  const job = draft?.job
  const open = useMemo(() => (job ? job.invoices.filter((i) => i.status !== 'paid').reverse() : []), [job])
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(isoDate())
  const [note, setNote] = useState('')
  // Paid in one currency, landed in another (billed in USD, deposited as CAD): what actually arrived.
  const [converted, setConverted] = useState(false)
  const [received, setReceived] = useState('')
  const [receivedCurrency, setReceivedCurrency] = useState(getDisplayCurrency)
  const [saving, setSaving] = useState(false)
  const fx = useFx()
  const invoice = open.find((i) => i.id === invoiceId) ?? job?.invoices.find((i) => i.id === invoiceId)

  useEffect(() => {
    if (!draft) return
    const target = draft.job.invoices.find((i) => i.id === draft.invoiceId) ?? draft.job.invoices.filter((i) => i.status !== 'paid').at(-1)
    setInvoiceId(target?.id ?? '')
    const usual = draft.job.payAmount && target ? Math.min(draft.job.payAmount, target.remaining) : target?.remaining
    setAmount(draft.amount ? String(Math.abs(draft.amount)) : usual ? String(usual) : '')
    setDate(draft.date ?? isoDate())
    setNote(draft.note ?? '')
    const home = getDisplayCurrency()
    setConverted(draft.job.currency !== home)
    setReceived('')
    setReceivedCurrency(home !== draft.job.currency ? home : draft.job.currency === 'USD' ? 'CAD' : 'USD')
  }, [draft])

  const value = Number(amount)
  const receivedN = Number(received)
  const receivedValid = !converted || !received || (Number.isFinite(receivedN) && receivedN > 0)
  const estimate = job && value > 0 ? convertAmount(value, job.currency, receivedCurrency, fx) : null
  const valid = !!invoice && Number.isFinite(value) && value > 0 && validDate(date) && receivedValid
  const after = invoice ? round2(invoice.remaining - (value || 0)) : 0
  const items = open.map((i) => ({
    value: i.id,
    label: `${formatShortDate(i.date)} · ${formatMoney(i.remaining, job?.currency)} left of ${formatMoney(i.total, job?.currency)}`,
  }))
  const quick = invoice
    ? [
        job?.payAmount && job.payAmount < invoice.remaining && { label: 'Usual', value: job.payAmount },
        { label: 'The rest', value: invoice.remaining },
      ].filter((q): q is { label: string; value: number } => !!q && q.value > 0)
    : []

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!job || !invoice || !valid) return
    setSaving(true)
    try {
      const before = new Set(invoice.payments.map((p) => p.id))
      const { job: updated } = await api.addWorkPayment(invoice.id, {
        amount: round2(value),
        date,
        note: note.trim() || null,
        transactionId: draft?.transactionId ?? null,
        ...(converted && receivedN > 0 && receivedCurrency !== job.currency
          ? { receivedAmount: round2(receivedN), receivedCurrency }
          : {}),
      })
      const inv = updated.invoices.find((i) => i.id === invoice.id)
      const added = inv?.payments.find((p) => !before.has(p.id))
      const line = added ? paymentLine(added, job.currency) : null
      const cleared = inv?.status === 'paid'
      toast.success(cleared ? `🎉 Bill cleared — ${formatMoney(inv.total, job.currency)} paid in full` : `${formatMoney(value, job.currency)} received`, {
        description: cleared ? undefined : `${formatMoney(inv?.remaining ?? 0, job.currency)} left on this bill`,
        duration: 8000,
        action: line
          ? {
              label: (
                <span className="flex items-center gap-1">
                  <Copy className="size-3" /> Copy update
                </span>
              ),
              onClick: () => void copyText(line).then((ok) => (ok ? toast.success('Copied', { description: line }) : toast.error('Couldn’t copy'))),
            }
          : undefined,
      })
      onClose()
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {job && (
              <>
                {job.name} · <Money value={job.owed} currency={job.currency} /> owed
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing’s owed right now. Bill some hours first.</p>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => void save(e)}>
            {open.length > 1 && (
              <div className="grid min-w-0 gap-2">
                <Label>Toward</Label>
                <Select items={items} value={invoiceId} onValueChange={(v) => v && setInvoiceId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid min-w-0 gap-2">
              <Label htmlFor="wp-amount">Amount</Label>
              <Input
                id="wp-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(money(e.target.value))}
                placeholder="0.00"
                className="h-11 text-lg tabular-nums"
                required
                autoFocus
              />
              {quick.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {quick.map((q) => (
                    <Button key={q.label} type="button" size="xs" variant="secondary" onClick={() => setAmount(String(q.value))}>
                      {q.label} · <Money value={q.value} currency={job?.currency} />
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="wp-date">Date</Label>
                <DatePicker id="wp-date" value={date} max={isoDate()} onChange={setDate} />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="wp-note">Note</Label>
                <Input id="wp-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e-Transfer" />
              </div>
            </div>

            {converted ? (
              <div className="grid min-w-0 gap-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wp-received">Landed in your account as</Label>
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setConverted(false)}>
                    Same currency
                  </button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
                  <Input
                    id="wp-received"
                    inputMode="decimal"
                    value={received}
                    onChange={(e) => setReceived(money(e.target.value))}
                    placeholder={estimate !== null ? estimate.toFixed(2) : '0.00'}
                    className="tabular-nums"
                  />
                  <CurrencySelect id="wp-received-currency" value={receivedCurrency} onChange={setReceivedCurrency} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {receivedN > 0 && value > 0 && job
                    ? `1 ${job.currency} = ${(receivedN / value).toFixed(4)} ${receivedCurrency} after fees and conversion`
                    : estimate !== null && job
                      ? `About ${formatMoney(estimate, receivedCurrency)} at today’s rate. Optional — enter what the bank shows.`
                      : 'Optional — enter what the bank shows.'}
                </p>
              </div>
            ) : (
              <button type="button" className="justify-self-start text-xs font-medium text-primary hover:underline" onClick={() => setConverted(true)}>
                Arrived in another currency?
              </button>
            )}

            {invoice && valid && (
              <div className="grid gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm animate-in fade-in-0 duration-200">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">After this</span>
                  <span className="font-medium tabular-nums">
                    {after <= 0.005 ? 'Paid off' : `${formatMoney(after, job?.currency)} remaining`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.min(100, ((invoice.total - Math.max(0, after)) / (invoice.total || 1)) * 100)}%`, ...accentStyle(job!.color) }}
                  />
                </div>
                {after < -0.005 && <p className="text-xs text-amber-600 dark:text-amber-400">That’s <Money value={-after} currency={job?.currency} /> more than this bill needs.</p>}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || saving}>
                {saving && <Loader2 className="animate-spin" />}
                Record payment
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
