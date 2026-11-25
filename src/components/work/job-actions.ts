import type { WorkInvoice, WorkJob } from "@/lib/api"

export interface JobActions {
  onLog: (j: WorkJob) => void
  onBill: (j: WorkJob, invoice?: WorkInvoice) => void
  onPay: (j: WorkJob, invoiceId?: string) => void
  onEdit: (j: WorkJob) => void
  onArchive: (j: WorkJob) => void
  onDelete: (j: WorkJob) => void
  onShare: (j: WorkJob) => void
  onLeave: (j: WorkJob) => void
}
