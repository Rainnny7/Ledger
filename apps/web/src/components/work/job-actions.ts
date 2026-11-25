import type { WorkInvoice, WorkJob } from "@/lib/api"

/** Work job row callbacks wired from the jobs list and cards. */
export interface JobActions {
	onLog: (job: WorkJob) => void
	onBill: (job: WorkJob, invoice?: WorkInvoice) => void
	onPay: (job: WorkJob, invoiceId?: string) => void
	onEdit: (job: WorkJob) => void
	onArchive: (job: WorkJob) => void
	onDelete: (job: WorkJob) => void
	onShare: (job: WorkJob) => void
	onLeave: (job: WorkJob) => void
}
