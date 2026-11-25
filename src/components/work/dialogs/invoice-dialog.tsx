import { InvoiceDialogForm } from "@/components/work/dialogs/invoice-dialog-form"
import { useWorkInvoiceDialog } from "@/components/work/dialogs/use-work-invoice-dialog"
import type { WorkInvoice, WorkJob } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
  const model = useWorkInvoiceDialog(draft, onClose)
  const job = draft?.job
  const editing = draft?.invoice

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
        <InvoiceDialogForm model={model} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}
