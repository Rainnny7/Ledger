import { confirmDialog } from "@/lib/confirm"
import { PlusIcon } from "@/components/icons/plus"
import { ChevronDown, Users } from "lucide-react"
import { AnimatedMoney } from "@/components/common/count-up"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
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
import { QueryError } from "@/components/ui/query-error"
import { cn } from "cn"
import { formatDuration } from "@/lib/work"

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

/** Freelance jobs: log hours, bill clients, record payments, and share with partners. */
export function WorkPage() {
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

	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Work
					</h1>
					<p className="text-sm text-muted-foreground">
						Log your hours, bill them, and track every instalment
						until you’re paid in full.
					</p>
				</div>
				{jobs.length > 0 && (
					<Button onClick={() => setJobDialog({ job: null })}>
						<PlusIcon size={24} className="flex" /> Add job
					</Button>
				)}
			</div>

			{error && !data && (
				<QueryError
					message={error.message}
					onRetry={() => void reload()}
				/>
			)}

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
									label="Owed to You"
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
									label="Next Payment"
									value={
										next ? (
											<AnimatedMoney
												value={Math.min(
													next.payAmount ?? next.owed,
													next.owed
												)}
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
									label="Not Billed Yet"
									value={
										<AnimatedMoney value={unbilledValue} />
									}
									hint={
										unbilledHours > 0
											? `${formatDuration(unbilledHours)} logged`
											: "No unbilled hours"
									}
								/>
								<WorkStat
									label="Paid This Month"
									value={
										<AnimatedMoney value={paidThisMonth} />
									}
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
								{active.map((job) => (
									<JobSection
										key={job.id}
										job={job}
										{...actions}
									/>
								))}
							</div>
						)}

						{sharedActive.length > 0 && (
							<section className="grid gap-4">
								<h2 className="flex items-center gap-2 text-sm font-semibold">
									<Users className="size-4 text-primary" />{" "}
									Shared with you
								</h2>
								<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))] items-start gap-4">
									{sharedActive.map((job) => (
										<JobSection
											key={job.id}
											job={job}
											{...actions}
										/>
									))}
								</div>
							</section>
						)}

						{archived.length > 0 && (
							<section className="grid gap-3">
								<button
									type="button"
									className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
									onClick={() =>
										setShowArchived((open) => !open)
									}
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
										{archived.map((job) => (
											<JobSection
												key={job.id}
												job={job}
												{...actions}
											/>
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
			<WorkInvoiceDialog
				draft={billing}
				onClose={() => setBilling(null)}
			/>
			<WorkPaymentDialog draft={paying} onClose={() => setPaying(null)} />
			<ShareDialog
				kind="job"
				item={sharing}
				onClose={() => setSharing(null)}
			/>
		</div>
	)
}
