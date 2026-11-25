import { Money } from "@/components/common/money"
import { accentStyle } from "@/components/goals/goal-meta"
import type { useWorkPaymentDialog } from "@/components/work/dialogs/use-work-payment-dialog"

type Model = ReturnType<typeof useWorkPaymentDialog>

/** React/UI entry: `PaymentDialogAfter`. */
export function PaymentDialogAfter({ model }: { model: Model }) {
	const { job, invoice, valid, after } = model
	if (!invoice || !valid) {
		return null
	}

	return (
		<div className="grid animate-in gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm duration-200 fade-in-0">
			<div className="flex justify-between gap-3">
				<span className="text-muted-foreground">After this</span>
				<span className="font-medium tabular-nums">
					{after <= 0.005 ? (
						"Paid off"
					) : (
						<>
							<Money value={after} currency={job?.currency} />{" "}
							remaining
						</>
					)}
				</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full transition-[width] duration-500"
					style={{
						width: `${Math.min(100, ((invoice.total - Math.max(0, after)) / (invoice.total || 1)) * 100)}%`,
						...accentStyle(job!.color),
					}}
				/>
			</div>
			{after < -0.005 && (
				<p className="text-xs text-amber-600 dark:text-amber-400">
					That’s <Money value={-after} currency={job?.currency} />{" "}
					more than this bill needs.
				</p>
			)}
		</div>
	)
}
