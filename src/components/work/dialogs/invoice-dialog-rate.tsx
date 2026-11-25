import { Money } from "@/components/common/money"
import type { useWorkInvoiceDialog } from "@/components/work/dialogs/use-work-invoice-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Model = ReturnType<typeof useWorkInvoiceDialog>

/** React/UI entry: `InvoiceDialogRate`. */
export function InvoiceDialogRate({ model }: { model: Model }) {
	const {
		job,
		rate,
		setRate,
		total,
		setTotal,
		totalTouched,
		setTotalTouched,
		autoTotal,
		totalN,
	} = model

	return (
		<>
			<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
				<div className="grid min-w-0 gap-2">
					<Label htmlFor="inv-rate">Rate / hr</Label>
					<Input
						id="inv-rate"
						inputMode="decimal"
						value={rate}
						onChange={(event) => setRate(event.target.value)}
					/>
				</div>
				<div className="grid min-w-0 gap-2">
					<div className="flex items-center justify-between">
						<Label htmlFor="inv-total">Total</Label>
						{totalTouched && (
							<button
								type="button"
								className="text-xs font-medium text-primary hover:underline"
								onClick={() => setTotalTouched(false)}
							>
								Use rate
							</button>
						)}
					</div>
					<Input
						id="inv-total"
						inputMode="decimal"
						value={
							totalTouched
								? total
								: autoTotal !== null
									? String(autoTotal)
									: ""
						}
						onChange={(event) => setTotal(event.target.value)}
						className="font-medium tabular-nums"
					/>
				</div>
			</div>
			{totalTouched &&
				autoTotal !== null &&
				totalN !== null &&
				Math.abs(totalN - autoTotal) > 0.005 && (
					<p className="-mt-2 text-xs text-muted-foreground">
						Agreed total —{" "}
						<Money value={autoTotal} currency={job?.currency} /> at
						the hourly rate.
					</p>
				)}
		</>
	)
}
