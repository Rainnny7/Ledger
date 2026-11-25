import { DatePicker } from '@/components/date-picker'
import { Hint } from '@/components/hint'
import { ArrowLeft, ChevronDown, Download, ExternalLink, Eye, Loader2, Plus, Save, Send, X } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { ForeignMoney } from '@/components/money'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { confirmDialog } from '@/components/confirm-dialog'
import { toast } from 'sonner'
import { fail, PaymentMethodDialog, pdfFileName, renderPdf, saveBlob, ShareDialog, StateBadge, invoiceState } from '@/components/invoice-bits'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencySelect } from '@/components/currency-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api, type Invoice, type InvoiceInput, type InvoiceParty, type InvoicesData, type PaymentMethod, type WorkJob } from '@/lib/api'
import { DEMO_READ_ONLY, demoMode } from '@/lib/demo'
import { addDays, daysFromToday, formatShortDate, isoDate } from '@/lib/format'
import { EMPTY_PARTY, invoiceMoney, invoiceTotals, methodKind, methodLines, round2, shareUrl, TEMPLATES, THEMES } from '@/lib/invoice'
import type { InvoicePdfSource } from '@/lib/invoice-pdf'
import { useInvoices, useWork } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { formatHours } from '@/lib/work'

/** Line items as typed: numbers stay strings until saved, so "1." or "" don't jump around. */
interface ItemDraft {
  key: number
  description: string
  quantity: string
  unitPrice: string
}

type Draft = Omit<InvoiceInput, 'items'> & { items: ItemDraft[] }

let itemKey = 0
const item = (description = '', quantity = '1', unitPrice = ''): ItemDraft => ({ key: ++itemKey, description, quantity, unitPrice })
const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
const decimal = (s: string) => s.replace(/[^\d.-]/g, '').replace(/(?!^)-/g, '').replace(/(\..*)\./g, '$1')

const toItems = (items: ItemDraft[]) =>
  items
    .filter((i) => i.description.trim() || num(i.unitPrice))
    .map((i) => ({ description: i.description.trim(), quantity: round2(num(i.quantity) * 1000) / 1000, unitPrice: round2(num(i.unitPrice)) }))

const DUE_PRESETS = [
  { days: 0, label: 'On receipt' },
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
]

/** A fresh invoice from your saved details, a copy of another one, or a Work bill. */
function startDraft(data: InvoicesData, opts: { source?: Invoice; bill?: { job: WorkJob; billId: string } }): Draft {
  const p = data.profile
  const today = isoDate()
  const defaults = data.methods.filter((m) => m.isDefault).map((m) => m.id)
  const base: Draft = {
    number: data.nextNumber,
    status: 'draft',
    template: p.template,
    theme: p.theme,
    currency: p.currency,
    issueDate: today,
    dueDate: p.dueDays === null ? null : addDays(today, p.dueDays),
    from: p.from,
    client: EMPTY_PARTY,
    items: [item()],
    taxRate: p.taxRate,
    taxLabel: p.taxLabel,
    discount: 0,
    notes: p.notes || null,
    terms: p.terms || null,
    methodIds: defaults,
    workInvoiceId: null,
  }
  const src = opts.source
  if (src) {
    const span = src.dueDate ? Math.max(0, -daysFromToday(src.dueDate) + daysFromToday(src.issueDate)) : null
    return {
      ...base,
      ...src,
      number: data.nextNumber,
      status: 'draft',
      issueDate: today,
      dueDate: span === null ? null : addDays(today, span),
      items: src.items.map((i) => item(i.description, String(i.quantity), String(i.unitPrice))),
      workInvoiceId: null,
    }
  }
  const bill = opts.bill && opts.bill.job.invoices.find((b) => b.id === opts.bill!.billId)
  if (opts.bill && bill) {
    const { job } = opts.bill
    const agreed = Math.abs(bill.total - round2(bill.hours * bill.rate)) > 0.005
    const what = `${job.name}: ${formatHours(bill.hours)} hrs${bill.note ? ` (${bill.note})` : ''}, up to ${formatShortDate(bill.date)}`
    return {
      ...base,
      currency: job.currency,
      client: { ...EMPTY_PARTY, name: job.name },
      items: agreed ? [item(what, '1', String(bill.total))] : [item(what, String(bill.hours), String(bill.rate))],
      workInvoiceId: bill.id,
    }
  }
  return base
}

export function InvoiceEditorPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { data, error } = useInvoices()
  const fromBill = params.get('fromBill')
  const work = useWork()
  const existing = id ? data?.invoices.find((i) => i.id === id) : undefined

  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  if (!data || (fromBill && !work.data)) return <EditorSkeleton />
  if (id && !existing) return <p className="text-sm text-muted-foreground">That invoice doesn’t exist any more. <Link to="/invoices" className="underline">Back to invoices</Link></p>

  const job = fromBill ? work.data?.jobs.find((j) => j.invoices.some((b) => b.id === fromBill)) : undefined
  const initial: Draft = existing
    ? { ...existing, items: existing.items.map((i) => item(i.description, String(i.quantity), String(i.unitPrice))) }
    : startDraft(data, { source: data.invoices.find((i) => i.id === params.get('copy')), bill: job && fromBill ? { job, billId: fromBill } : undefined })

  // Re-mount when switching invoices so the form starts over.
  return <Editor key={id ?? `new-${params.toString()}`} data={data} saved={existing ?? null} initial={initial} />
}

function EditorSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <Skeleton className="hidden h-[70svh] rounded-xl lg:block" />
    </div>
  )
}

function Editor({ data, saved, initial }: { data: InvoicesData; saved: Invoice | null; initial: Draft }) {
  const navigate = useNavigate()
  const [d, setD] = useState<Draft>(initial)
  const [saving, setSaving] = useState<'save' | 'send' | null>(null)
  const [sharing, setSharing] = useState(false)
  const [methodDialog, setMethodDialog] = useState<{ method: PaymentMethod | null } | null>(null)
  const [showFrom, setShowFrom] = useState(!initial.from.name)
  const [showMore, setShowMore] = useState(!!(initial.client.phone || initial.client.taxId))
  const [dirty, setDirtyState] = useState(false)
  // Also kept in a ref for the navigation guard below: saving clears it and navigates in the same
  // tick, before a re-render would tell the guard.
  const dirtyRef = useRef(false)
  const setDirty = (v: boolean) => {
    dirtyRef.current = v
    setDirtyState(v)
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    setDirty(true)
  }
  const setParty = (k: 'from' | 'client', patch: Partial<InvoiceParty>) => {
    setD((x) => ({ ...x, [k]: { ...x[k], ...patch } }))
    setDirty(true)
  }
  const setItem = (key: number, patch: Partial<ItemDraft>) => {
    setD((x) => ({ ...x, items: x.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }))
    setDirty(true)
  }

  const items = toItems(d.items)
  const totals = invoiceTotals({ items, taxRate: d.taxRate, discount: d.discount })
  const paid = saved?.paid ?? 0
  const money = (n: number) => invoiceMoney(n, d.currency)
  // On screen, amounts in another currency show your own on hover.
  const shown = (n: number) => <ForeignMoney value={n} currency={d.currency}>{money(n)}</ForeignMoney>
  const chosen = d.methodIds.map((mid) => data.methods.find((m) => m.id === mid)).filter((m): m is PaymentMethod => !!m)

  // People you've billed before, newest first, for one-tap filling.
  const recentClients = useMemo(() => {
    const seen = new Map<string, InvoiceParty>()
    for (const inv of data.invoices) if (inv.client.name && !seen.has(inv.client.name.toLowerCase())) seen.set(inv.client.name.toLowerCase(), inv.client)
    return [...seen.values()].slice(0, 6)
  }, [data.invoices])

  const valid = d.number.trim() && items.length > 0 && items.every((i) => i.description) && /^\d{4}-\d{2}-\d{2}$/.test(d.issueDate)

  const source: InvoicePdfSource = { invoice: { ...d, items }, methods: chosen, paid, url: saved ? shareUrl(saved.token) : null }

  async function save(then: 'stay' | 'send') {
    if (demoMode) return toast.error(DEMO_READ_ONLY)
    if (!valid) return toast.error(items.length ? 'Every line item needs a description.' : 'Add at least one line item.')
    setSaving(then === 'send' ? 'send' : 'save')
    const body: InvoiceInput = {
      ...d,
      number: d.number.trim(),
      items,
      notes: d.notes?.trim() || null,
      terms: d.terms?.trim() || null,
      taxLabel: d.taxLabel.trim() || 'Tax',
    }
    try {
      const { invoice } = saved ? await api.updateInvoice(saved.id, body) : await api.createInvoice(body)
      setDirty(false)
      if (!saved) navigate(`/invoices/${invoice.id}${then === 'send' ? '?send=1' : ''}`, { replace: true })
      else if (then === 'send') setSharing(true)
      if (then === 'stay') toast.success(saved ? 'Invoice saved' : `Invoice ${invoice.number} saved`)
    } catch (err) {
      fail(err)
    } finally {
      setSaving(null)
    }
  }

  // Arriving from "Save & send" on a new invoice: open the send dialog once it's loaded.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (saved && params.get('send')) {
      setSharing(true)
      setParams({}, { replace: true })
    }
  }, [saved, params, setParams])

  // Warn before leaving with unsaved changes: closing the tab, and moving elsewhere in the app.
  useEffect(() => {
    if (!dirty || demoMode) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !demoMode && dirtyRef.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void confirmDialog({
      title: 'Leave without saving?',
      description: 'Your changes to this invoice haven’t been saved.',
      action: 'Leave',
      destructive: true,
    }).then((leave) => (leave ? blocker.proceed() : blocker.reset()))
  }, [blocker])

  const state = saved ? invoiceState(saved) : null
  const liveSaved = saved ? (data.invoices.find((i) => i.id === saved.id) ?? saved) : null
  const dueDays = d.dueDate ? Math.round((Date.parse(d.dueDate) - Date.parse(d.issueDate)) / 86_400_000) : 0

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon-sm" aria-label="Back to invoices" render={<Link to="/invoices" />} nativeButton={false}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 truncate text-2xl font-semibold tracking-tight">
            {saved ? `Invoice ${saved.number}` : 'New invoice'}
            {state && <StateBadge state={state} />}
          </h1>
          {saved && saved.paid > 0 && (
            <p className="text-sm text-muted-foreground">
              {shown(saved.paid)} paid · {shown(saved.balance)} left
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={saving !== null} onClick={() => void save('stay')}>
            {saving === 'save' ? <Loader2 className="animate-spin" /> : <Save />}
            {saved ? 'Save' : 'Save draft'}
          </Button>
          <Button disabled={saving !== null} onClick={() => void save('send')}>
            {saving === 'send' ? <Loader2 className="animate-spin" /> : <Send />}
            {saved && !dirty ? 'Send' : 'Save & send'}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          {/* ------------------------------------------------ who */}
          <Card>
            <CardHeader>
              <CardTitle>Bill to</CardTitle>
              {recentClients.length > 0 && <CardDescription>Or pick someone you’ve billed before.</CardDescription>}
            </CardHeader>
            <CardContent className="grid gap-3">
              {recentClients.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {recentClients.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => set('client', c)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted',
                        d.client.name === c.name && 'border-primary bg-primary/10 text-primary',
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="client-name" label="Name or company">
                  <Input id="client-name" value={d.client.name} maxLength={120} onChange={(e) => setParty('client', { name: e.target.value })} placeholder="Who you’re billing" />
                </Field>
                <Field id="client-email" label="Email">
                  <Input id="client-email" type="email" value={d.client.email} maxLength={200} onChange={(e) => setParty('client', { email: e.target.value })} placeholder="For sending it (optional)" />
                </Field>
              </div>
              <Field id="client-address" label="Address">
                <Textarea id="client-address" rows={2} value={d.client.address} maxLength={400} onChange={(e) => setParty('client', { address: e.target.value })} placeholder="Optional" />
              </Field>
              {showMore ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="client-phone" label="Phone">
                    <Input id="client-phone" value={d.client.phone} maxLength={50} onChange={(e) => setParty('client', { phone: e.target.value })} />
                  </Field>
                  <Field id="client-tax" label="Tax / business number">
                    <Input id="client-tax" value={d.client.taxId} maxLength={60} onChange={(e) => setParty('client', { taxId: e.target.value })} />
                  </Field>
                </div>
              ) : (
                <button type="button" className="justify-self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowMore(true)}>
                  + Phone or tax number
                </button>
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------------ items */}
          <Card>
            <CardHeader>
              <CardTitle>What it’s for</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6rem_2rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>Description</span>
                <span>Qty</span>
                <span>Rate</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              {d.items.map((it, idx) => (
                <div key={it.key} className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6rem_2rem] sm:items-center">
                  <Input
                    aria-label={`Item ${idx + 1} description`}
                    value={it.description}
                    maxLength={300}
                    onChange={(e) => setItem(it.key, { description: e.target.value })}
                    placeholder={idx === 0 ? 'e.g. Website design' : 'Description'}
                    autoFocus={idx === 0 && !it.description && !!initial.client.name}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove item ${idx + 1}`}
                    disabled={d.items.length === 1}
                    onClick={() => set('items', d.items.filter((x) => x.key !== it.key))}
                    className="sm:order-last"
                  >
                    <X />
                  </Button>
                  <div className="col-span-2 grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:contents">
                    <Input aria-label="Quantity" inputMode="decimal" value={it.quantity} onChange={(e) => setItem(it.key, { quantity: decimal(e.target.value) })} />
                    <Input aria-label="Rate" inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(it.key, { unitPrice: decimal(e.target.value) })} placeholder="0.00" />
                    <span className="min-w-16 text-right text-sm tabular-nums">{shown(round2(num(it.quantity) * num(it.unitPrice)))}</span>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="justify-self-start" onClick={() => set('items', [...d.items, item()])}>
                <Plus /> Add line
              </Button>

              <div className="mt-2 grid gap-2 border-t pt-3 text-sm">
                <Row label="Subtotal" value={shown(totals.subtotal)} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Discount</span>
                  <Input
                    aria-label="Discount"
                    inputMode="decimal"
                    className="h-8 w-28 text-right"
                    value={d.discount ? String(d.discount) : ''}
                    placeholder="0.00"
                    onChange={(e) => set('discount', Math.max(0, num(decimal(e.target.value))))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Input aria-label="Tax name" className="h-8 w-20" value={d.taxLabel} maxLength={30} onChange={(e) => set('taxLabel', e.target.value)} />
                    <Input
                      aria-label="Tax rate"
                      inputMode="decimal"
                      className="h-8 w-16 text-right"
                      value={d.taxRate ? String(d.taxRate) : ''}
                      placeholder="0"
                      onChange={(e) => set('taxRate', Math.min(100, Math.max(0, num(decimal(e.target.value)))))}
                    />
                    %
                  </span>
                  <span className="tabular-nums">{shown(totals.tax)}</span>
                </div>
                <Row label="Total" value={shown(totals.total)} strong />
                {paid > 0 && <Row label="Already paid" value={shown(-paid)} />}
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------ when */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field id="inv-number" label="Invoice no.">
                  <Input id="inv-number" value={d.number} maxLength={40} onChange={(e) => set('number', e.target.value)} />
                </Field>
                <Field id="inv-date" label="Issued">
                  <DatePicker
                    id="inv-date"
                    value={d.issueDate}
                    onChange={(v) => {
                      setD((x) => ({ ...x, issueDate: v, dueDate: x.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(v) ? addDays(v, dueDays) : x.dueDate }))
                      setDirty(true)
                    }}
                  />
                </Field>
                <Field id="inv-currency" label="Currency">
                  <CurrencySelect id="inv-currency" value={d.currency} onChange={(v) => set('currency', v)} />
                </Field>
              </div>
              <div className="grid gap-2">
                <Label>Due</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DUE_PRESETS.map((p) => {
                    const active = p.days === 0 ? !d.dueDate : d.dueDate && dueDays === p.days
                    return (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => set('dueDate', p.days === 0 ? null : addDays(d.issueDate, p.days))}
                        className={cn(
                          'h-8 rounded-lg border px-3 text-sm transition-colors hover:bg-muted',
                          active && 'border-primary bg-primary/10 text-primary hover:bg-primary/15',
                        )}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                  <DatePicker
                    aria-label="Due date"
                    placeholder="Due date"
                    className="w-44"
                    value={d.dueDate ?? ''}
                    min={d.issueDate}
                    clearable
                    onChange={(v) => set('dueDate', v || null)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------ how to pay */}
          <Card>
            <CardHeader>
              <CardTitle>How they can pay</CardTitle>
              <CardDescription>Shown on the PDF and the invoice page with copy buttons and QR codes.</CardDescription>
              <CardAction>
                <Button variant="outline" size="sm" onClick={() => setMethodDialog({ method: null })}>
                  <Plus /> Add
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.methods.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setMethodDialog({ method: null })}
                  className="w-full rounded-lg border border-dashed p-4 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                >
                  Add e-Transfer, PayPal, crypto, a bank account or anything else. It’s saved for next time.
                </button>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.methods.map((m) => {
                    const on = d.methodIds.includes(m.id)
                    return (
                      <label
                        key={m.id}
                        className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40', on && 'border-primary/60 bg-primary/5')}
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={(v) => set('methodIds', v ? [...d.methodIds, m.id] : d.methodIds.filter((x) => x !== m.id))}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{m.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {m.kind === 'paypal-checkout'
                              ? 'Pay with PayPal or card · marked paid automatically'
                              : methodLines(m)
                                  .map((l) => l.value)
                                  .join(' · ') || methodKind(m.kind).label}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------------ look */}
          <Card>
            <CardHeader>
              <CardTitle>Look</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-3 gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={d.template === t.id}
                    onClick={() => set('template', t.id)}
                    className={cn(
                      'grid gap-2 rounded-lg border p-2 text-sm transition-colors hover:bg-muted/40',
                      d.template === t.id && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <TemplateThumb template={t.id} color={THEMES.find((x) => x.id === d.theme)?.swatch ?? '#18181b'} />
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <Hint key={t.id} label={t.label}>
                  <button
                    type="button"
                    aria-label={`${t.label} colours`}
                    aria-pressed={d.theme === t.id}
                    onClick={() => set('theme', t.id)}
                    className={cn(
                      'size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110',
                      d.theme === t.id && 'ring-2 ring-foreground/70',
                    )}
                    style={{ backgroundColor: t.swatch }}
                  />
                  </Hint>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------ notes */}
          <Card>
            <CardHeader>
              <CardTitle>Notes & terms</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field id="inv-notes" label="Notes">
                <Textarea id="inv-notes" rows={3} maxLength={2000} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Thanks for your business!" />
              </Field>
              <Field id="inv-terms" label="Terms">
                <Textarea id="inv-terms" rows={3} maxLength={2000} value={d.terms ?? ''} onChange={(e) => set('terms', e.target.value)} placeholder="e.g. Payment due within 14 days." />
              </Field>
            </CardContent>
          </Card>

          {/* ------------------------------------------------ from */}
          <Card>
            <CardHeader>
              <CardTitle>Your details</CardTitle>
              <CardDescription>{d.from.name ? `${d.from.name} · remembered for every invoice` : 'Who the invoice is from. Remembered for next time.'}</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" onClick={() => setShowFrom((s) => !s)} aria-expanded={showFrom}>
                  {showFrom ? 'Hide' : 'Edit'}
                  <ChevronDown className={cn('transition-transform', showFrom && 'rotate-180')} />
                </Button>
              </CardAction>
            </CardHeader>
            {showFrom && (
              <CardContent className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="from-name" label="Your name or business">
                    <Input id="from-name" value={d.from.name} maxLength={120} onChange={(e) => setParty('from', { name: e.target.value })} />
                  </Field>
                  <Field id="from-email" label="Email">
                    <Input id="from-email" type="email" value={d.from.email} maxLength={200} onChange={(e) => setParty('from', { email: e.target.value })} />
                  </Field>
                  <Field id="from-phone" label="Phone">
                    <Input id="from-phone" value={d.from.phone} maxLength={50} onChange={(e) => setParty('from', { phone: e.target.value })} />
                  </Field>
                  <Field id="from-tax" label="Tax number (GST/HST, VAT…)">
                    <Input id="from-tax" value={d.from.taxId} maxLength={60} onChange={(e) => setParty('from', { taxId: e.target.value })} />
                  </Field>
                </div>
                <Field id="from-address" label="Address">
                  <Textarea id="from-address" rows={2} value={d.from.address} maxLength={400} onChange={(e) => setParty('from', { address: e.target.value })} />
                </Field>
              </CardContent>
            )}
          </Card>
        </div>

        <Preview source={source} fileName={pdfFileName({ number: d.number, client: d.client })} />
      </div>

      {liveSaved && sharing && <ShareDialog invoice={liveSaved} methods={data.methods} onClose={() => setSharing(false)} />}
      <PaymentMethodDialog
        open={!!methodDialog}
        method={methodDialog?.method ?? null}
        paypal={data.paypal}
        onClose={() => setMethodDialog(null)}
        onSaved={(m) => !d.methodIds.includes(m.id) && set('methodIds', [...d.methodIds, m.id])}
      />
    </div>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', strong && 'text-base font-semibold')}>
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

/** A tiny sketch of each template's layout, in the chosen colour. */
function TemplateThumb({ template, color }: { template: string; color: string }) {
  const bar = (w: string, h = 'h-1', c = 'bg-muted-foreground/25') => <span className={cn('block rounded-full', w, h, c)} />
  return (
    <span aria-hidden className="grid aspect-[3/4] w-full content-start gap-1 rounded-md border bg-background p-1.5">
      {template === 'modern' && <span className="block h-3 rounded-sm" style={{ backgroundColor: color }} />}
      {template === 'minimal' && (
        <span className="flex items-start justify-between">
          {bar('w-1/2', 'h-1.5')}
          <span className="block size-3 rounded-sm border-2" style={{ borderColor: color }} />
        </span>
      )}
      {template === 'classic' && (
        <span className="flex justify-between border-b pb-1" style={{ borderColor: color }}>
          <span className="block h-1.5 w-1/3 rounded-full" style={{ backgroundColor: color }} />
          {bar('w-1/4')}
        </span>
      )}
      <span className="mt-1 grid gap-0.5">
        {template === 'modern' ? <span className="block h-1 rounded-full" style={{ backgroundColor: color }} /> : bar('w-full', 'h-1', 'bg-muted-foreground/40')}
        {bar('w-full')}
        {bar('w-full')}
        {bar('w-3/4')}
      </span>
      <span className="mt-1 ml-auto grid w-1/2 gap-0.5">
        {bar('w-full')}
        <span className="block h-1 rounded-full" style={{ backgroundColor: color }} />
      </span>
    </span>
  )
}

// ---------------------------------------------------------------- live PDF preview

/**
 * The real PDF, re-drawn a moment after you stop typing. Phones can't show PDFs inline,
 * so there it's a button that opens the PDF in a new tab.
 */
function Preview({ source, fileName }: { source: InvoicePdfSource; fileName: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const last = useRef<string | null>(null)
  // Re-draw only when something on the PDF changed, not on every render of the form.
  const key = JSON.stringify(source)
  const draw = useEffectEvent(() => renderPdf(source))

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    const t = setTimeout(() => {
      draw()
        .then((b) => {
          if (cancelled) return
          const next = URL.createObjectURL(b)
          if (last.current) URL.revokeObjectURL(last.current)
          last.current = next
          setBlob(b)
          setUrl(next)
          setError(null)
        })
        .catch((e: Error) => !cancelled && setError(e.message))
        .finally(() => !cancelled && setBusy(false))
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [key])

  useEffect(() => () => void (last.current && URL.revokeObjectURL(last.current)), [])

  const actions = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={!url} render={<a href={url ?? undefined} target="_blank" rel="noreferrer" />} nativeButton={false}>
        <ExternalLink /> Open
      </Button>
      <Button variant="outline" size="sm" disabled={!blob} onClick={() => blob && saveBlob(blob, fileName)}>
        <Download /> Download
      </Button>
    </div>
  )

  return (
    <div className="grid gap-2 lg:sticky lg:top-20">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Eye className="size-4 text-muted-foreground" /> Preview
          {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </span>
        {actions}
      </div>
      {error && <p className="text-sm text-destructive">Couldn’t draw the PDF: {error}</p>}
      <div className="hidden overflow-hidden rounded-xl border bg-muted/40 lg:block">
        {url ? (
          <iframe title="Invoice PDF preview" src={`${url}#toolbar=0&navpanes=0&view=FitH`} className="aspect-[210/297] w-full bg-white" />
        ) : (
          <div className="flex aspect-[210/297] items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground lg:hidden">
        Open the preview to see the PDF exactly as it will be sent.
      </p>
    </div>
  )
}

