import { Money } from "@/components/common/money"
import type { useWorkPaymentDialog } from "@/components/work/dialogs/use-work-payment-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

type Model = ReturnType<typeof useWorkPaymentDialog>

/** React/UI entry: `PaymentDialogAmount`. */
export function PaymentDialogAmount({ model }: { model: Model }) {
	const {
		job,
		open,
		invoiceId,
		setInvoiceId,
		amount,
		setAmountInput,
		setAmountQuick,
		items,
		quick,
	} = model

	return (
		<>
			{open.length > 1 && (
				<div className="grid min-w-0 gap-2">
					<Label>Toward</Label>
					<Select
						items={items}
						value={invoiceId}
						onValueChange={(value) => value && setInvoiceId(value)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{items.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			<div className="grid min-w-0 gap-2">
				<Label htmlFor="wp-amount">Amount</Label>
				<Input
					id="wp-amount"
					inputMode="decimal"
					value={amount}
					onChange={(event) => setAmountInput(event.target.value)}
					placeholder="0.00"
					className="h-11 text-lg tabular-nums"
					required
					autoFocus
				/>
				{quick.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{quick.map((quickAmount) => (
							<Button
								key={quickAmount.label}
								type="button"
								size="xs"
								variant="secondary"
								onClick={() =>
									setAmountQuick(String(quickAmount.value))
								}
							>
								{quickAmount.label} ·{" "}
								<Money
									value={quickAmount.value}
									currency={job?.currency}
								/>
							</Button>
						))}
					</div>
				)}
			</div>
		</>
	)
}
