import { confirmDialog } from "@/lib/confirm"
import { ChevronDown, Plus, Users } from "lucide-react"
import { AnimatedMoney } from "@/components/common/count-up"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ShareDialog } from "@/components/sharing/share-bits"
import { leaveShared, splitShared } from "@/lib/sharing"
import { Button } from "@/components/ui/button"
import { Bones } from "@/components/common/bones"
import { Skeleton } from "@/components/ui/skeleton"
import { WorkEntryDialog } from "@/components/work/dialogs/entry-dialog"
import {
  WorkInvoiceDialog,
  type InvoiceDraft,
} from "@/components/work/dialogs/invoice-dialog"
import { WorkJobDialog } from "@/components/work/dialogs/job-dialog"
import {
  WorkPaymentDialog,
  type WorkPaymentDraft,
} from "@/components/work/dialogs/payment-dialog"
import { EmptyWork } from "@/components/work/empty-work"
import type { JobActions } from "@/components/work/job-actions"
import { JobSection } from "@/components/work/job-section"
import { WorkStat } from "@/components/work/work-stat"
import { api, type WorkJob } from "@/lib/api"
import {
  formatDate,
  formatMonth,
  formatRelativeDate,
  formatShortDate,
  isoDate,
} from "@/lib/format"
import { useConverter } from "@/lib/currency"
import { useWork } from "@/lib/queries"
import { useIntent } from "@/lib/url-state"
import { cn } from "cn"
import { formatDuration } from "@/lib/work"

const fail = (err: unknown) => toast.error((err as Error).message)

export function WorkPage() {
  const { data, loading, error } = useWork()
  const [jobDialog, setJobDialog] = useState<{ job: WorkJob | null } | null>(
    null
  )
  const [logging, setLogging] = useState<WorkJob | null>(null)
  const [billing, setBilling] = useState<InvoiceDraft | null>(null)
  const [paying, setPaying] = useState<WorkPaymentDraft | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [sharing, setSharing] = useState<WorkJob | null>(null)

  const { own: jobs, shared } = useMemo(
    () => splitShared(data?.jobs ?? []),
    [data]
  )
  const sharedActive = shared.filter((j) => !j.archived)
  const active = jobs.filter((j) => !j.archived)
  const archived = jobs.filter((j) => j.archived)

  const fx = useConverter()
  const owed = fx.sum(active.map((j) => [j.owed, j.currency]))
  const unbilledHours = active.reduce((s, j) => s + j.unbilledHours, 0)
  const unbilledValue = fx.sum(active.map((j) => [j.unbilledValue, j.currency]))
  const month = isoDate().slice(0, 7)
  const monthPayments = active.flatMap((j) =>
    j.invoices.flatMap((inv) =>
      inv.payments
        .filter((p) => p.date.startsWith(month))
        .map((p) =>
          p.receivedAmount && p.receivedCurrency
            ? ([p.receivedAmount, p.receivedCurrency] as const)
            : ([p.amount, j.currency] as const)
        )
    )
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

  useIntent("new", () => setJobDialog({ job: null }))
  useIntent(
    "log",
    (id: string) => {
      const job = active.find((j) => j.id === id)
      if (job) setLogging(job)
    },
    !!data
  )

  async function removeJob(j: WorkJob) {
    const bills = j.invoices.length
    if (
      !(await confirmDialog({
        title: `Delete ${j.name}?`,
        description: `${bills ? `Its ${bills} bill${bills === 1 ? "" : "s"}, payments and logged hours are deleted too. ` : ""}This can’t be undone.`,
        action: "Delete job",
        destructive: true,
      }))
    )
      return
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
    onLeave: (j) => void leaveShared("job", j),
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Work</h1>
          <p className="text-sm text-muted-foreground">
            Log your hours, bill them, and track every instalment until you’re
            paid in full.
          </p>
        </div>
        {jobs.length > 0 && (
          <Button onClick={() => setJobDialog({ job: null })}>
            <Plus /> Add job
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      <Bones
        name="work"
        className="grid gap-8"
        loading={!data && loading}
        fallback={
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        }
      >
        {jobs.length === 0 && sharedActive.length === 0 ? (
          <EmptyWork onAdd={() => setJobDialog({ job: null })} />
        ) : (
          <>
            {active.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <WorkStat
                  label="Owed to you"
                  value={<AnimatedMoney value={owed} />}
                  hint={
                    payoff
                      ? `Cleared by ${formatDate(payoff)} at this pace`
                      : owed > 0
                        ? "Across your open bills"
                        : "All caught up"
                  }
                />
                <WorkStat
                  label="Next payment"
                  value={
                    next ? (
                      <AnimatedMoney
                        value={Math.min(next.payAmount ?? next.owed, next.owed)}
                        currency={next.currency}
                      />
                    ) : (
                      "—"
                    )
                  }
                  hint={
                    next
                      ? `${formatRelativeDate(next.nextPaymentDate!)} · ${formatShortDate(next.nextPaymentDate!)}`
                      : "Nothing scheduled"
                  }
                />
                <WorkStat
                  label="Not billed yet"
                  value={<AnimatedMoney value={unbilledValue} />}
                  hint={
                    unbilledHours > 0
                      ? `${formatDuration(unbilledHours)} logged`
                      : "No unbilled hours"
                  }
                />
                <WorkStat
                  label="Paid this month"
                  value={<AnimatedMoney value={paidThisMonth} />}
                  hint={
                    monthPayments.length
                      ? `${monthPayments.length} payment${monthPayments.length === 1 ? "" : "s"} dated in ${formatMonth(month, "long")}`
                      : "No payments yet"
                  }
                />
              </div>
            )}

            {active.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))] items-start gap-4">
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
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))] items-start gap-4">
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
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      !showArchived && "-rotate-90"
                    )}
                  />
                  Archived jobs ({archived.length})
                </button>
                {showArchived && (
                  <div className="grid animate-in grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))] items-start gap-4 opacity-80 duration-200 fade-in-0">
                    {archived.map((j) => (
                      <JobSection key={j.id} job={j} {...actions} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </Bones>

      <WorkJobDialog
        open={!!jobDialog}
        job={jobDialog?.job}
        onClose={() => setJobDialog(null)}
      />
      <WorkEntryDialog job={logging} onClose={() => setLogging(null)} />
      <WorkInvoiceDialog draft={billing} onClose={() => setBilling(null)} />
      <WorkPaymentDialog draft={paying} onClose={() => setPaying(null)} />
      <ShareDialog kind="job" item={sharing} onClose={() => setSharing(null)} />
    </div>
  )
}
