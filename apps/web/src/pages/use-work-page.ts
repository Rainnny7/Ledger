import { confirmDialog } from "@/lib/confirm"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { leaveShared, splitShared } from "@/lib/sharing"
import type { InvoiceDraft } from "@/components/work/dialogs/invoice-dialog"
import type { WorkPaymentDraft } from "@/components/work/dialogs/payment-dialog"
import type { JobActions } from "@/components/work/job-actions"
import { api, type WorkJob } from "@/lib/api"
import { isoDate } from "@/lib/format"
import { useConverter } from "@/lib/converter-provider"
import { useWork } from "@/lib/queries"
import { useIntent } from "@/lib/url-state"

const fail = (error: unknown) => toastError((error as Error).message)

async function removeJob(job: WorkJob) {
	const bills = job.invoices.length
	if (
		!(await confirmDialog({
			title: `Delete ${job.name}?`,
			description: `${bills ? `Its ${bills} bill${bills === 1 ? "" : "s"}, payments and logged hours are deleted too. ` : ""}This can’t be undone.`,
			action: "Delete job",
			destructive: true,
		}))
	) {
		return
	}
	try {
		await api.deleteWorkJob(job.id)
		toast.success(`${job.name} deleted`)
	} catch (error) {
		fail(error)
	}
}

async function setJobArchived(job: WorkJob, value: boolean) {
	try {
		await api.updateWorkJob(job.id, { archived: value })
		toast.success(value ? `${job.name} archived` : `${job.name} restored`)
	} catch (error) {
		fail(error)
	}
}

/**
 * Work page queries, dialog state, stats, and job actions.
 */
export function useWorkPage() {
	const { data, loading, error, reload } = useWork()
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
	const sharedActive = shared.filter((job) => !job.archived)
	const active = jobs.filter((job) => !job.archived)
	const archived = jobs.filter((job) => job.archived)

	const fx = useConverter()
	const owed = fx.sum(active.map((job) => [job.owed, job.currency]))
	const unbilledHours = active.reduce(
		(sum, job) => sum + job.unbilledHours,
		0
	)
	const unbilledValue = fx.sum(
		active.map((job) => [job.unbilledValue, job.currency])
	)
	const month = isoDate().slice(0, 7)
	const monthPayments = active.flatMap((job) =>
		job.invoices.flatMap((invoice) =>
			invoice.payments
				.filter((payment) => payment.date.startsWith(month))
				.map((payment) =>
					payment.receivedAmount && payment.receivedCurrency
						? ([
								payment.receivedAmount,
								payment.receivedCurrency,
							] as const)
						: ([payment.amount, job.currency] as const)
				)
		)
	)
	const paidThisMonth = fx.sum(monthPayments)
	const next = active
		.filter((job) => job.nextPaymentDate)
		.toSorted((left, right) =>
			left.nextPaymentDate!.localeCompare(right.nextPaymentDate!)
		)[0]
	const payoff = active
		.map((job) => job.payoffDate)
		.filter((payoffDate): payoffDate is string => !!payoffDate)
		.toSorted()
		.at(-1)

	useIntent("new", () => setJobDialog({ job: null }))
	useIntent(
		"log",
		(id: string) => {
			const job = active.find((candidate) => candidate.id === id)
			if (job) {
				setLogging(job)
			}
		},
		!!data
	)

	const actions: JobActions = {
		onLog: (job) => setLogging(job),
		onBill: (job, invoice) => setBilling({ job, invoice }),
		onPay: (job, invoiceId) => setPaying({ job, invoiceId }),
		onEdit: (job) => setJobDialog({ job }),
		onArchive: (job) => void setJobArchived(job, !job.archived),
		onDelete: (job) => void removeJob(job),
		onShare: (job) => setSharing(job),
		onLeave: (job) => void leaveShared("job", job),
	}

	return {
		data,
		loading,
		error,
		reload,
		jobDialog,
		setJobDialog,
		logging,
		setLogging,
		billing,
		setBilling,
		paying,
		setPaying,
		showArchived,
		setShowArchived,
		sharing,
		setSharing,
		jobs,
		sharedActive,
		active,
		archived,
		owed,
		unbilledHours,
		unbilledValue,
		monthPayments,
		paidThisMonth,
		next,
		payoff,
		month,
		actions,
	}
}
