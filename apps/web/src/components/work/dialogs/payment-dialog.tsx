import { Money } from "@/components/common/money"
import { PaymentDialogForm } from "@/components/work/dialogs/payment-dialog-form"
import { useWorkPaymentDialog } from "@/components/work/dialogs/use-work-payment-dialog"
import type { WorkJob } from "@/lib/api"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"

/** Shape for `WorkPaymentDraft` used across this module. */
export interface WorkPaymentDraft {
	job: WorkJob
	invoiceId?: string
	amount?: number
	date?: string
	note?: string
	transactionId?: string
}

/** React/UI entry: `WorkPaymentDialog`. */
export function WorkPaymentDialog({
	draft,
	onClose,
}: {
	draft: WorkPaymentDraft | null
	onClose: () => void
}) {
	const model = useWorkPaymentDialog(draft, onClose)
	const { job, open } = model

	return (
		<Dialog open={!!draft} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Record a Payment</DialogTitle>
					<DialogDescription>
						{job && (
							<>
								{job.name} ·{" "}
								<Money
									value={job.owed}
									currency={job.currency}
								/>{" "}
								owed
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				{open.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nothing’s owed right now. Bill some hours first.
					</p>
				) : (
					<PaymentDialogForm model={model} onClose={onClose} />
				)}
			</DialogContent>
		</Dialog>
	)
}
