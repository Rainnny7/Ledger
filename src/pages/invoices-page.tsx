import { WithContextMenu } from '@/components/app-context-menu'
import { confirmDialog } from '@/components/confirm-dialog'
import { ForeignMoney } from '@/components/money'
import { Hint } from '@/components/hint'
import {
  Ban,
  CopyPlus,
  Download,
  FileText,
  HandCoins,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Wallet,
} from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  fail,
  type InvoiceState,
  invoiceState,
  PaymentMethodDialog,
  pdfFileName,
  pdfSource,
  RecordPaymentDialog,
  renderPdf,
  saveBlob,
  ShareDialog,
  StateBadge,
} from '@/components/invoice-bits'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api, type Invoice, type PaymentMethod } from '@/lib/api'
import { demoMode } from '@/lib/demo'
import { daysFromToday, formatShortDate, isoDate } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { invoiceMoney, methodKind, methodLines } from '@/lib/invoice'
import { useInvoices } from '@/lib/queries'

const readOnly = () => toast.error('Demo mode is read-only. Exit demo mode to make changes.')

type Filter = 'all' | 'unpaid' | 'paid' | 'draft'
const FILTERS: { value: Filter; label: string; match: (s: InvoiceState) => boolean }[] = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'unpaid', label: 'Unpaid', match: (s) => s === 'sent' || s === 'viewed' || s === 'overdue' || s === 'partial' },
  { value: 'paid', label: 'Paid', match: (s) => s === 'paid' },
  { value: 'draft', label: 'Drafts', match: (s) => s === 'draft' },
]

/** Sums per currency, so CAD and USD invoices never get added together. */
function sumByCurrency(list: Invoice[], pick: (i: Invoice) => number) {
  const by = new Map<string, number>()
  for (const i of list) by.set(i.currency, (by.get(i.currency) ?? 0) + pick(i))
  const parts = [...by].filter(([, n]) => n > 0)
  if (!parts.length) return invoiceMoney(0, list[0]?.currency ?? 'CAD')
  return parts.map(([c, n], i) => (
    <Fragment key={c}>
      {i > 0 && ' + '}
      <ForeignMoney value={n} currency={c}>{invoiceMoney(n, c)}</ForeignMoney>
    </Fragment>
  ))
}

export function InvoicesPage() {
  const { data, loading, error } = useInvoices()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [sharing, setSharing] = useState<Invoice | null>(null)
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [methodDialog, setMethodDialog] = useState<{ method: PaymentMethod | null } | null>(null)

  const invoices = useMemo(() => data?.invoices ?? [], [data])
  const methods = data?.methods ?? []
  const withState = invoices.map((inv) => ({ inv, state: invoiceState(inv) }))
  const shown = withState.filter((x) => FILTERS.find((f) => f.value === filter)!.match(x.state))

  const open = withState.filter((x) => FILTERS[1]!.match(x.state)).map((x) => x.inv)
  const overdue = withState.filter((x) => x.state === 'overdue').map((x) => x.inv)
  const now = useNow()
  const month = isoDate(now).slice(0, 7)
  const paidThisMonth = invoices.filter((i) => i.payments.some((p) => p.date.startsWith(month)))

  // Keep the dialogs on the latest copy after a write refreshes the list.
  const live = (inv: Invoice | null) => (inv ? (invoices.find((i) => i.id === inv.id) ?? inv) : null)

  async function removeMethod(m: PaymentMethod) {
    if (!(await confirmDialog({ title: `Remove ${m.label}?`, description: 'Invoices that offered it stop showing it.', action: 'Remove', destructive: true }))) return
    try {
      await api.deletePaymentMethod(m.id)
      toast.success(`${m.label} removed`)
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">Make an invoice in a minute, send the link or PDF, and see when it’s paid.</p>
        </div>
        <Button render={<Link to="/invoices/new" />} nativeButton={false}>
          <Plus /> New invoice
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!data && loading ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        data && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Outstanding" value={sumByCurrency(open, (i) => i.balance)} hint={`${open.length} invoice${open.length === 1 ? '' : 's'} waiting`} />
              <Stat
                label="Overdue"
                value={sumByCurrency(overdue, (i) => i.balance)}
                hint={overdue.length ? `${overdue.length} past the due date` : 'Nothing late'}
                tone={overdue.length ? 'bad' : undefined}
              />
              <Stat
                label="Paid this month"
                value={sumByCurrency(paidThisMonth, (i) => i.payments.filter((p) => p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0))}
                hint={`${paidThisMonth.length} invoice${paidThisMonth.length === 1 ? '' : 's'}`}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Your invoices</CardTitle>
                <CardAction>
                  <ToggleGroup value={[filter]} onValueChange={(v) => v[0] && setFilter(v[0] as Filter)} variant="outline" size="sm">
                    {FILTERS.map((f) => (
                      <ToggleGroupItem key={f.value} value={f.value}>
                        {f.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-2">
                {invoices.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
                    <FileText className="size-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium">No invoices yet</p>
                      <p className="text-sm text-muted-foreground">Your details and payment methods are remembered, so every invoice after the first is quicker.</p>
                    </div>
                    <Button render={<Link to="/invoices/new" />} nativeButton={false}>
                      <Plus /> Create your first invoice
                    </Button>
                  </div>
                ) : shown.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
                ) : (
                  shown.map(({ inv, state }) => (
                    <InvoiceRow
                      key={inv.id}
                      invoice={inv}
                      state={state}
                      methods={methods}
                      onOpen={() => navigate(`/invoices/${inv.id}`)}
                      onShare={() => setSharing(inv)}
                      onPay={() => setPaying(inv)}
                      onDuplicate={() => navigate(`/invoices/new?copy=${inv.id}`)}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment methods</CardTitle>
                <CardDescription>How people can pay you. Tick the ones you want on each invoice.</CardDescription>
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => setMethodDialog({ method: null })}>
                    <Plus /> Add
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {methods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    None yet. Add e-Transfer, PayPal, crypto, a bank account or anything else, and it’s ready for every invoice.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {methods.map((m) => {
                      const methodItems = (
                        <>
                          <DropdownMenuItem onClick={() => setMethodDialog({ method: m })}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => void removeMethod(m)}>
                            <Trash2 /> Remove
                          </DropdownMenuItem>
                        </>
                      )
                      return (
                      <WithContextMenu key={m.id} menu={methodItems}>
                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <Wallet className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {m.label}
                            {m.isDefault && <span className="ml-2 text-xs font-normal text-muted-foreground">default</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.kind === 'paypal-checkout'
                              ? 'PayPal / card checkout, marked paid automatically'
                              : methodLines(m)
                                  .map((l) => l.value)
                                  .join(' · ') || methodKind(m.kind).label}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`${m.label} options`} />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">{methodItems}</DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      </WithContextMenu>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )
      )}

      <ShareDialog invoice={live(sharing)} methods={methods} onClose={() => setSharing(null)} />
      <RecordPaymentDialog invoice={live(paying)} methods={methods} onClose={() => setPaying(null)} />
      <PaymentMethodDialog
        open={!!methodDialog}
        method={methodDialog?.method ?? null}
        paypal={data?.paypal ?? []}
        onClose={() => setMethodDialog(null)}
      />
    </div>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: 'bad' }) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={tone === 'bad' ? 'text-xl font-semibold text-red-600 tabular-nums dark:text-red-400' : 'text-xl font-semibold tabular-nums'}>
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </CardContent>
    </Card>
  )
}

function InvoiceRow({
  invoice: inv,
  state,
  methods,
  onOpen,
  onShare,
  onPay,
  onDuplicate,
}: {
  invoice: Invoice
  state: InvoiceState
  methods: PaymentMethod[]
  onOpen: () => void
  onShare: () => void
  onPay: () => void
  onDuplicate: () => void
}) {
  const [downloading, setDownloading] = useState(false)
  const money = (n: number) => invoiceMoney(n, inv.currency)
  const due = inv.dueDate ? daysFromToday(inv.dueDate) : null
  const dueText =
    state === 'paid'
      ? `Paid ${formatShortDate(inv.payments.at(-1)?.date ?? inv.issueDate)}`
      : state === 'void' || state === 'draft' || due === null
        ? `Issued ${formatShortDate(inv.issueDate)}`
        : due < 0
          ? `${-due} day${due === -1 ? '' : 's'} overdue`
          : due === 0
            ? 'Due today'
            : `Due ${formatShortDate(inv.dueDate!)}`

  async function download() {
    setDownloading(true)
    try {
      saveBlob(await renderPdf(pdfSource(inv, methods)), pdfFileName(inv))
    } catch (err) {
      fail(err)
    } finally {
      setDownloading(false)
    }
  }

  async function setStatus(status: Invoice['status'], done: string) {
    if (demoMode) return readOnly()
    try {
      await api.updateInvoice(inv.id, { status })
      toast.success(done)
    } catch (err) {
      fail(err)
    }
  }

  async function remove() {
    if (demoMode) return readOnly()
    if (!(await confirmDialog({ title: `Delete invoice ${inv.number}?`, description: 'Its link stops working. This can’t be undone.', action: 'Delete invoice', destructive: true }))) return
    try {
      await api.deleteInvoice(inv.id)
      toast.success(`${inv.number} deleted`)
    } catch (err) {
      fail(err)
    }
  }

  const menuItems = (
    <>
      <DropdownMenuItem onClick={onShare}>
        <Send /> Send / share
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => void download()}>
        <Download /> Download PDF
      </DropdownMenuItem>
      {state !== 'paid' && state !== 'void' && (
        <DropdownMenuItem onClick={onPay}>
          <HandCoins /> Record payment
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onOpen}>
        <Pencil /> Edit
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onDuplicate}>
        <CopyPlus /> Duplicate
      </DropdownMenuItem>
      {state === 'void' ? (
        <DropdownMenuItem onClick={() => void setStatus('sent', `${inv.number} restored`)}>
          <RotateCcw /> Restore
        </DropdownMenuItem>
      ) : (
        state !== 'paid' && (
          <DropdownMenuItem onClick={() => void setStatus('void', `${inv.number} voided`)}>
            <Ban /> Void
          </DropdownMenuItem>
        )
      )}
      <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
        <Trash2 /> Delete
      </DropdownMenuItem>
    </>
  )

  return (
    <WithContextMenu menu={menuItems}>
    <div className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
      <button type="button" onClick={onOpen} className="grid min-w-0 flex-1 gap-0.5 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{inv.client.name || 'No client yet'}</span>
          <StateBadge state={state} />
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {inv.number} · {dueText}
        </span>
      </button>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">
          <ForeignMoney value={state === 'partial' || state === 'overdue' ? inv.balance : inv.total} currency={inv.currency}>
            {money(state === 'partial' || state === 'overdue' ? inv.balance : inv.total)}
          </ForeignMoney>
        </p>
        {inv.paid > 0 && inv.balance > 0 && <p className="text-xs text-muted-foreground tabular-nums">of <ForeignMoney value={inv.total} currency={inv.currency}>{money(inv.total)}</ForeignMoney></p>}
      </div>
      <Hint label="Send">
        <Button variant="ghost" size="icon-sm" aria-label={`Send ${inv.number}`} onClick={onShare} className="max-sm:hidden">
          <Send />
        </Button>
      </Hint>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${inv.number} options`} />}>
          {downloading ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {menuItems}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    </WithContextMenu>
  )
}
