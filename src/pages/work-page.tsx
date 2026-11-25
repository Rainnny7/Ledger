import { WithContextMenu } from '@/components/app-context-menu'
import { confirmDialog } from '@/components/confirm-dialog'
import { Money } from '@/components/money'
import { Hint } from '@/components/hint'
import type { ReactNode } from 'react'
import {
  Archive,
  ArchiveRestore,
  Briefcase,
  CalendarClock,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  HandCoins,
  Link2,
  MoreHorizontal,
  LogOut,
  Pencil,
  Plus,
  ReceiptText,
  Share2,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { AnimatedMoney } from '@/components/count-up'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { accentStyle, tintStyle } from '@/components/goal-bits'
import { ShareBadge, ShareDialog } from '@/components/share-bits'
import { leaveShared, shortName, splitShared } from '@/lib/sharing'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type InvoiceDraft,
  WorkEntryDialog,
  WorkInvoiceDialog,
  WorkJobDialog,
  WorkPaymentDialog,
  type WorkPaymentDraft,
} from '@/components/work-dialogs'
import { api, type InvoiceStatus, type WorkInvoice, type WorkJob } from '@/lib/api'
import { demoMode } from '@/lib/demo'
import { formatDate, formatMoney, formatMonth, formatRelativeDate, formatShortDate, isoDate } from '@/lib/format'
import { useConverter } from '@/lib/currency'
import { useWork } from '@/lib/queries'
import { useIntent } from '@/lib/url-state'
import { cn } from '@/lib/utils'
import { copyText, formatDuration, formatHours, invoiceText, payEveryLabel, paymentLine } from '@/lib/work'

const fail = (err: unknown) => toast.error((err as Error).message)
const readOnly = () => toast.error('Demo mode is read-only. Exit demo mode to make changes.')

async function copy(text: string, what: string) {
  if (await copyText(text)) toast.success(`${what} copied`, { description: text.length > 120 ? `${text.slice(0, 120)}…` : text })
  else toast.error('Couldn’t copy to the clipboard')
}

export function WorkPage() {
  const { data, loading, error } = useWork()
  const [jobDialog, setJobDialog] = useState<{ job: WorkJob | null } | null>(null)
  const [logging, setLogging] = useState<WorkJob | null>(null)
  const [billing, setBilling] = useState<InvoiceDraft | null>(null)
  const [paying, setPaying] = useState<WorkPaymentDraft | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [sharing, setSharing] = useState<WorkJob | null>(null)

  // Totals are your own jobs; ones shared with you get their own section.
  const { own: jobs, shared } = useMemo(() => splitShared(data?.jobs ?? []), [data])
  const sharedActive = shared.filter((j) => !j.archived)
  const active = jobs.filter((j) => !j.archived)
  const archived = jobs.filter((j) => j.archived)

  // Jobs can pay in different currencies; the totals are in the home currency. Money that arrived
  // converted (billed in USD, landed as CAD) counts at what actually landed.
  const fx = useConverter()
  const owed = fx.sum(active.map((j) => [j.owed, j.currency]))
  const unbilledHours = active.reduce((s, j) => s + j.unbilledHours, 0)
  const unbilledValue = fx.sum(active.map((j) => [j.unbilledValue, j.currency]))
  const month = isoDate().slice(0, 7)
  // Counted by each payment's own date (not its bill's), so a late payment on an old bill counts here.
  const monthPayments = active.flatMap((j) =>
    j.invoices.flatMap((inv) =>
      inv.payments
        .filter((p) => p.date.startsWith(month))
        .map((p) => (p.receivedAmount && p.receivedCurrency ? ([p.receivedAmount, p.receivedCurrency] as const) : ([p.amount, j.currency] as const))),
    ),
  )
  const paidThisMonth = fx.sum(monthPayments)
  const next = active
    .filter((j) => j.nextPaymentDate)
    .sort((a, b) => a.nextPaymentDate!.localeCompare(b.nextPaymentDate!))[0]
  const payoff = active
    .map((j) => j.payoffDate)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1)

  // From the command palette: `?new=1` adds a job, `?log=<job id>` logs hours on one.
  useIntent('new', () => setJobDialog({ job: null }))
  useIntent(
    'log',
    (id: string) => {
      const job = active.find((j) => j.id === id)
      if (job) setLogging(job)
    },
    !!data,
  )

  async function removeJob(j: WorkJob) {
    const bills = j.invoices.length
    if (!(await confirmDialog({ title: `Delete ${j.name}?`, description: `${bills ? `Its ${bills} bill${bills === 1 ? '' : 's'}, payments and logged hours are deleted too. ` : ''}This can’t be undone.`, action: 'Delete job', destructive: true }))) return
    try {
      await api.deleteWorkJob(j.id)
      toast.success(`${j.name} deleted`)
    } catch (err) {
      fail(err)
    }
  }

  async function setArchived(j: WorkJob, value: boolean) {
    try {
      await api.updateWorkJob(j.id, { archived: value })
      toast.success(value ? `${j.name} archived` : `${j.name} restored`)
    } catch (err) {
      fail(err)
    }
  }

  const actions: JobActions = {
    onLog: (j) => setLogging(j),
    onBill: (j, invoice) => setBilling({ job: j, invoice }),
    onPay: (j, invoiceId) => setPaying({ job: j, invoiceId }),
    onEdit: (j) => setJobDialog({ job: j }),
    onArchive: (j) => void setArchived(j, !j.archived),
    onDelete: (j) => void removeJob(j),
    onShare: (j) => setSharing(j),
    onLeave: (j) => void leaveShared('job', j),
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Work</h1>
          <p className="text-sm text-muted-foreground">Log your hours, bill them, and track every instalment until you’re paid in full.</p>
        </div>
        {jobs.length > 0 && (
          <Button onClick={() => setJobDialog({ job: null })}>
            <Plus /> Add job
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!data && loading ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : jobs.length === 0 && sharedActive.length === 0 ? (
        <EmptyWork onAdd={() => setJobDialog({ job: null })} />
      ) : (
        <>
          {active.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Owed to you" value={<AnimatedMoney value={owed} />} hint={payoff ? `Cleared by ${formatDate(payoff)} at this pace` : owed > 0 ? 'Across your open bills' : 'All caught up'} />
              <Stat
                label="Next payment"
                value={next ? <AnimatedMoney value={Math.min(next.payAmount ?? next.owed, next.owed)} currency={next.currency} /> : '—'}
                hint={next ? `${formatRelativeDate(next.nextPaymentDate!)} · ${formatShortDate(next.nextPaymentDate!)}` : 'Nothing scheduled'}
              />
              <Stat label="Not billed yet" value={<AnimatedMoney value={unbilledValue} />} hint={unbilledHours > 0 ? `${formatDuration(unbilledHours)} logged` : 'No unbilled hours'} />
              <Stat
                label="Paid this month"
                value={<AnimatedMoney value={paidThisMonth} />}
                hint={monthPayments.length ? `${monthPayments.length} payment${monthPayments.length === 1 ? '' : 's'} dated in ${formatMonth(month, 'long')}` : 'No payments yet'}
              />
            </div>
          )}

          {active.length > 0 && (
            <div className="grid items-start gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))]">
              {active.map((j) => (
                <JobSection key={j.id} job={j} {...actions} />
              ))}
            </div>
          )}

          {sharedActive.length > 0 && (
            <section className="grid gap-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-primary" /> Shared with you
              </h2>
              <div className="grid items-start gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))]">
                {sharedActive.map((j) => (
                  <JobSection key={j.id} job={j} {...actions} />
                ))}
              </div>
            </section>
          )}

          {archived.length > 0 && (
            <section className="grid gap-3">
              <button
                type="button"
                className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setShowArchived((v) => !v)}
              >
                <ChevronDown className={cn('size-4 transition-transform', !showArchived && '-rotate-90')} />
                Archived jobs ({archived.length})
              </button>
              {showArchived && (
                <div className="grid items-start gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))] opacity-80 animate-in fade-in-0 duration-200">
                  {archived.map((j) => (
                    <JobSection key={j.id} job={j} {...actions} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <WorkJobDialog open={!!jobDialog} job={jobDialog?.job} onClose={() => setJobDialog(null)} />
      <WorkEntryDialog job={logging} onClose={() => setLogging(null)} />
      <WorkInvoiceDialog draft={billing} onClose={() => setBilling(null)} />
      <WorkPaymentDialog draft={paying} onClose={() => setPaying(null)} />
      <ShareDialog kind="job" item={sharing} onClose={() => setSharing(null)} />
    </div>
  )
}

interface JobActions {
  onLog: (j: WorkJob) => void
  onBill: (j: WorkJob, invoice?: WorkInvoice) => void
  onPay: (j: WorkJob, invoiceId?: string) => void
  onEdit: (j: WorkJob) => void
  onArchive: (j: WorkJob) => void
  onDelete: (j: WorkJob) => void
  onShare: (j: WorkJob) => void
  onLeave: (j: WorkJob) => void
}

function JobSection({ job: j, ...actions }: { job: WorkJob } & JobActions) {
  const [showPaid, setShowPaid] = useState(false)
  const openBills = j.invoices.filter((i) => i.status !== 'paid')
  const paidBills = j.invoices.filter((i) => i.status === 'paid')
  const owner = j.access === 'owner'
  // Demo mode, or a job someone shared with you to look at only.
  const readonly = j.access === 'view'

  async function removeEntry(id: string) {
    if (demoMode) return readOnly()
    try {
      await api.deleteWorkEntry(id)
      toast.success('Shift removed')
    } catch (err) {
      fail(err)
    }
  }

  const menuItems = (
    <>
      {!readonly && (
        <DropdownMenuItem onClick={() => actions.onEdit(j)}>
          <Pencil /> Edit job
        </DropdownMenuItem>
      )}
      {owner ? (
        <>
          <DropdownMenuItem onClick={() => actions.onShare(j)}>
            <Share2 /> Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.onArchive(j)}>
            {j.archived ? <ArchiveRestore /> : <Archive />} {j.archived ? 'Restore' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(j)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </>
      ) : (
        <DropdownMenuItem variant="destructive" onClick={() => actions.onLeave(j)}>
          <LogOut /> Remove from my jobs
        </DropdownMenuItem>
      )}
    </>
  )

  return (
    <WithContextMenu menu={menuItems}>
    <Card className="@container min-w-0 gap-0">
      <CardHeader className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={tintStyle(j.color)}>
          <Briefcase className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2">
            <span className="truncate">{j.name}</span>
            <ShareBadge item={j} onClick={() => actions.onShare(j)} />
          </CardTitle>
          <CardDescription className="truncate">
            <Money value={j.rate} currency={j.currency} />/hr
            {j.payAmount && j.payEveryDays ? (
              <>
                {' · paid '}
                <Money value={j.payAmount} currency={j.currency} /> {payEveryLabel(j.payEveryDays)}
              </>
            ) : null}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`${j.name} options`} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="grid gap-5 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">{j.owner ? `Owed to ${shortName(j.owner)}` : 'Owed to you'}</p>
            <p className="text-3xl font-semibold tabular-nums"><Money value={j.owed} currency={j.currency} /></p>
            <p className="mt-0.5 text-sm text-muted-foreground">{jobNudge(j)}</p>
          </div>
          {!readonly && !j.archived && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => actions.onLog(j)}>
                <Clock /> Log hours
              </Button>
              <Button variant="outline" onClick={() => actions.onBill(j)}>
                <ReceiptText /> Bill hours
                {j.unbilledHours > 0 && <span className="text-muted-foreground tabular-nums">· {formatHours(j.unbilledHours)}h</span>}
              </Button>
              <Button onClick={() => actions.onPay(j)} disabled={j.owed <= 0}>
                <HandCoins /> Record payment
              </Button>
            </div>
          )}
        </div>

        {j.notes && <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{j.notes}</p>}

        {j.unbilled.length > 0 && (
          <div className="grid gap-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase">Not billed yet</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDuration(j.unbilledHours)} · <Money value={j.unbilledValue} currency={j.currency} />
              </span>
            </div>
            <ul className="grid text-sm">
              {j.unbilled.map((e) => (
                <li key={e.id} className="group flex items-center gap-2 rounded-md px-2 py-1 odd:bg-muted/40">
                  <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{formatShortDate(e.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{e.note}</span>
                  <span className="tabular-nums">{formatDuration(e.hours)}</span>
                  {!readonly && (
                    <button
                      type="button"
                      aria-label="Remove shift"
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                      onClick={() => void removeEntry(e.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {openBills.length > 0 && (
          <div className="grid gap-3 @2xl:grid-cols-2">
            {openBills.map((inv) => (
              <InvoiceCard key={inv.id} job={j} invoice={inv} {...actions} />
            ))}
          </div>
        )}

        {j.invoices.length === 0 && j.unbilled.length === 0 && (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Log shifts as you work them, or jump straight to <span className="font-medium text-foreground">Bill hours</span> when you send your total.
          </p>
        )}

        {paidBills.length > 0 && (
          <div className="grid gap-3">
            <button
              type="button"
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setShowPaid((v) => !v)}
            >
              <ChevronDown className={cn('size-4 transition-transform', !showPaid && '-rotate-90')} />
              Paid bills ({paidBills.length}) · <Money value={paidBills.reduce((s, i) => s + i.total, 0)} currency={j.currency} />
            </button>
            {showPaid && (
              <div className="grid gap-3 @2xl:grid-cols-2 animate-in fade-in-0 duration-200">
                {paidBills.map((inv) => (
                  <InvoiceCard key={inv.id} job={j} invoice={inv} {...actions} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </WithContextMenu>
  )
}

function jobNudge(j: WorkJob): ReactNode {
  if (j.owed <= 0) return j.unbilledHours > 0 ? `${formatDuration(j.unbilledHours)} ready to bill` : 'All paid up'
  if (j.payoffDate && j.paymentsLeft) {
    const next = j.nextPaymentDate === isoDate() ? 'next one due today' : `next ${formatShortDate(j.nextPaymentDate!)}`
    return `${j.paymentsLeft} more payment${j.paymentsLeft === 1 ? '' : 's'} · ${next} · cleared by ${formatDate(j.payoffDate)}`
  }
  return j.lastPaymentDate ? `Last paid ${formatRelativeDate(j.lastPaymentDate)}` : <>Billed <Money value={j.billedTotal} currency={j.currency} /> so far</>
}

const STATUS: Record<InvoiceStatus, { label: string; className: string }> = {
  unpaid: { label: 'Unpaid', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  partial: { label: 'Paying off', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  paid: { label: 'Paid', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
}

function InvoiceCard({ job: j, invoice: inv, onBill, onPay }: { job: WorkJob; invoice: WorkInvoice } & JobActions) {
  const money = (n: number) => formatMoney(n, j.currency)
  const status = STATUS[inv.status]
  const [showAll, setShowAll] = useState(false)
  // Newest first on screen, like a feed.
  const payments = [...inv.payments].reverse()
  const shown = showAll ? payments : payments.slice(0, 4)
  const readonly = j.access === 'view'

  async function remove() {
    const n = inv.payments.length
    if (!(await confirmDialog({ title: `Delete this ${money(inv.total)} bill?`, description: `${n ? `Its ${n} payment${n === 1 ? '' : 's'} are deleted too. ` : ''}Logged shifts on it go back to “not billed”.`, action: 'Delete bill', destructive: true }))) return
    try {
      await api.deleteWorkInvoice(inv.id)
      toast.success('Bill deleted')
    } catch (err) {
      fail(err)
    }
  }

  async function removePayment(id: string) {
    if (demoMode) return readOnly()
    try {
      await api.deleteWorkPayment(id)
      toast.success('Payment removed')
    } catch (err) {
      fail(err)
    }
  }

  const menuItems = (
    <>
      {inv.status !== 'paid' && !j.archived && (
        <DropdownMenuItem onClick={() => onPay(j, inv.id)}>
          <HandCoins /> Record payment
        </DropdownMenuItem>
      )}
      {/* Invoices go out under the owner's business details. */}
      {j.access === 'owner' && (
        <DropdownMenuItem render={<Link to={`/invoices/new?fromBill=${inv.id}`} />}>
          <FileText /> Make an invoice
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => onBill(j, inv)}>
        <Pencil /> Edit bill
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
        <Trash2 /> Delete bill
      </DropdownMenuItem>
    </>
  )

  return (
    <WithContextMenu
      menu={
        <>
          <DropdownMenuItem onClick={() => void copy(invoiceText(inv, j.currency), 'Bill')}>
            <Copy /> Copy as a message
          </DropdownMenuItem>
          {!readonly && (
            <>
              <DropdownMenuSeparator />
              {menuItems}
            </>
          )}
        </>
      }
    >
    <div className="grid min-w-0 gap-3 rounded-xl border p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            Billed {formatShortDate(inv.date)}
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', status.className)}>{status.label}</span>
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatHours(inv.hours)} hrs × <Money value={inv.rate} currency={j.currency} />
            {Math.abs(inv.total - Math.round(inv.hours * inv.rate * 100) / 100) > 0.005 && ' (agreed total)'}
            {inv.counterHours !== null && ` · tracker at ${formatHours(inv.counterHours)}`}
          </p>
        </div>
        <Hint label="Copy as a message">
          <Button variant="ghost" size="icon-xs" aria-label="Copy for chat" onClick={() => void copy(invoiceText(inv, j.currency), 'Bill')}>
            <Copy />
          </Button>
        </Hint>
        {!readonly && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Bill options" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menuItems}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2 tabular-nums">
          <span className="text-xl font-semibold"><Money value={inv.status === 'paid' ? inv.total : inv.remaining} currency={j.currency} /></span>
          <span className="text-xs text-muted-foreground">
            {inv.status === 'paid' ? `paid ${inv.paidAt ? formatShortDate(inv.paidAt) : ''}` : <>left of <Money value={inv.total} currency={j.currency} /></>}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(inv.progress * 100)}%`, ...accentStyle(j.color) }} />
        </div>
        {inv.overpaid > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">Overpaid by <Money value={inv.overpaid} currency={j.currency} /></p>}
      </div>

      {(inv.proofUrl || inv.note) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {inv.proofUrl && (
            <a href={inv.proofUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <ExternalLink className="size-3" /> Proof
            </a>
          )}
          {inv.note && <span className="min-w-0 break-words whitespace-pre-line">{inv.note}</span>}
        </div>
      )}

      {payments.length > 0 && (
        <div className="grid gap-1">
          <ul className="grid text-sm">
            {shown.map((p) => (
              <li key={p.id} className="group flex items-center gap-2 rounded-md px-2 py-1 odd:bg-muted/40">
                <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{formatShortDate(p.date)}</span>
                <span className="text-emerald-600 tabular-nums dark:text-emerald-400">+<Money value={p.amount} currency={j.currency} /></span>
                {p.receivedAmount && p.receivedCurrency && (
                  <Hint label={`Landed as ${formatMoney(p.receivedAmount, p.receivedCurrency)} ${p.receivedCurrency} · 1 ${j.currency} = ${(p.receivedAmount / p.amount).toFixed(4)} ${p.receivedCurrency}`}>
                    <span className="shrink-0 cursor-default text-xs text-muted-foreground tabular-nums">
                      → {formatMoney(p.receivedAmount, p.receivedCurrency)}
                    </span>
                  </Hint>
                )}
                <span className="flex min-w-0 flex-1 items-center justify-end gap-1 truncate text-xs text-muted-foreground tabular-nums">
                  {p.transactionId && <Link2 className="size-3 shrink-0" aria-label="Linked to a transaction" />}
                  {p.remainingAfter > 0 ? <><Money value={p.remainingAfter} currency={j.currency} /> left</> : 'cleared'}
                </span>
                <Hint label={`Copy: ${paymentLine(p, j.currency)}`}>
                <button
                  type="button"
                  aria-label="Copy update"
                  className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  onClick={() => void copy(paymentLine(p, j.currency), 'Update')}
                >
                  <Copy className="size-3.5" />
                </button>
                </Hint>
                {!readonly && (
                  <button
                    type="button"
                    aria-label="Remove payment"
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                    onClick={() => void removePayment(p.id)}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {payments.length > 4 && (
            <button type="button" className="w-fit text-xs font-medium text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show less' : `Show all ${payments.length}`}
            </button>
          )}
        </div>
      )}
    </div>
    </WithContextMenu>
  )
}

function EmptyWork({ onAdd }: { onAdd: () => void }) {
  const steps = [
    { icon: Clock, title: 'Log hours', body: 'Add shifts as you go, or just your tracker total.' },
    { icon: ReceiptText, title: 'Bill them', body: '“done 40 hours since last pay, total is $1,000.”' },
    { icon: CalendarClock, title: 'Get paid in instalments', body: 'Record each payment and see when it’s cleared.' },
  ]
  return (
    <Card className="items-center py-12 text-center">
      <CardContent className="flex flex-col items-center gap-5">
        <span className="grid size-14 place-items-center rounded-2xl" style={tintStyle('ocean')}>
          <Briefcase className="size-7" />
        </span>
        <div>
          <h2 className="font-semibold">Track a side job</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            For hourly work you bill yourself. Keep the running total of what you’re owed in one place instead of a chat thread.
          </p>
        </div>
        <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border p-3 text-left">
              <Icon className="mb-2 size-4 text-primary" />
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <Button onClick={onAdd}>
          <Plus /> Add a job
        </Button>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl! font-semibold tabular-nums">{value}</CardTitle>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  )
}
