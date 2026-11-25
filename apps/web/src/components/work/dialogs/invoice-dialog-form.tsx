import { InvoiceDialogHours } from "@/components/work/dialogs/invoice-dialog-hours"
import { InvoiceDialogMeta } from "@/components/work/dialogs/invoice-dialog-meta"
import { InvoiceDialogRate } from "@/components/work/dialogs/invoice-dialog-rate"
import type { useWorkInvoiceDialog } from "@/components/work/dialogs/use-work-invoice-dialog"
import { WorkDialogFooter } from "@/components/work/dialogs/work-dialog-footer"

type Model = ReturnType<typeof useWorkInvoiceDialog>

/** React/UI entry: `InvoiceDialogForm`. */
export function InvoiceDialogForm({
	model,
	onClose,
}: {
	model: Model
	onClose: () => void
}) {
	const { save, valid, saving, submitLabel } = model

	return (
		<form className="grid gap-4" onSubmit={(event) => void save(event)}>
			<InvoiceDialogHours model={model} />
			<InvoiceDialogRate model={model} />
			<InvoiceDialogMeta model={model} />
			<WorkDialogFooter
				onClose={onClose}
				submitLabel={submitLabel}
				disabled={!valid}
				saving={saving}
			/>
		</form>
	)
}
