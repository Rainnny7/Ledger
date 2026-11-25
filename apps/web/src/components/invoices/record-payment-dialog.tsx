import { DatePicker } from "@/components/common/date-picker"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, type Invoice, type PaymentMethod } from "@/lib/api"
import { isoDate } from "@/lib/format"
import { invoiceMoney } from "@/lib/invoice"
import { roundMoney } from "@ledger/shared/money"
import { cn } from "cn"
import { notifyFailure } from "@/components/invoices/notify"

/** React/UI entry: `RecordPaymentDialog`. */
export function RecordPaymentDialog({
	invoice,
	methods,
	onClose,
}: {
	invoice: Invoice | null
	methods: PaymentMethod[]
	onClose: () => void
}) {
	if (!invoice) {
		return null
	}
	// Keyed by id: a fresh form per invoice, but a refetch of the same invoice keeps what's typed.
	return (
		<RecordPaymentForm
			key={invoice.id}
			invoice={invoice}
			methods={methods}
			onClose={onClose}
		/>
	)
}

function RecordPaymentForm({
	invoice,
	methods,
	onClose,
}: {
	invoice: Invoice
	methods: PaymentMethod[]
	onClose: () => void
}) {
	const [amount, setAmount] = useState(() =>
		invoice.balance > 0 ? String(invoice.balance) : ""
	)
	const [date, setDate] = useState(() => isoDate())
	// Prefill the method when the invoice offers exactly one.
	const [method, setMethod] = useState(() => {
		const onInvoice = new Set(invoice.methodIds)
		const offered = methods.filter((candidate) =>
			onInvoice.has(candidate.id)
		)
		return offered.length === 1 ? offered[0]!.label : ""
	})
	const [note, setNote] = useState("")
	const [saving, setSaving] = useState(false)

	const parsedAmount = Number(amount)
	const valid =
		Number.isFinite(parsedAmount) &&
		parsedAmount > 0 &&
		/^\d{4}-\d{2}-\d{2}$/.test(date)
	const labels = [...new Set(methods.map((candidate) => candidate.label))]

	async function save(event: React.FormEvent) {
		event.preventDefault()
		if (!valid) {
			return
		}
		setSaving(true)
		try {
			const { invoice: updated } = await api.addInvoicePayment(
				invoice.id,
				{
					amount: roundMoney(parsedAmount),
					date,
					method: method.trim() || null,
					note: note.trim() || null,
				}
			)
			toast.success(
				updated.payState === "paid"
					? `${invoice.number} is paid in full`
					: `Recorded ${invoiceMoney(parsedAmount, invoice.currency)}`,
				{
					description:
						updated.payState === "paid"
							? undefined
							: `${invoiceMoney(updated.balance, invoice.currency)} still owed`,
				}
			)
			onClose()
		} catch (error) {
			notifyFailure(error)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Record a payment</DialogTitle>
					<DialogDescription>
						{invoice.number} ·{" "}
						{invoiceMoney(invoice.balance, invoice.currency)} owed
						of {invoiceMoney(invoice.total, invoice.currency)}
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={(event) => void save(event)}
				>
					<div className="grid grid-cols-2 gap-3">
						<div className="grid min-w-0 gap-2">
							<Label htmlFor="pay-amount">
								Amount ({invoice.currency})
							</Label>
							<Input
								id="pay-amount"
								inputMode="decimal"
								value={amount}
								onChange={(event) =>
									setAmount(
										event.target.value.replace(
											/[^\d.]/g,
											""
										)
									)
								}
								autoFocus
								required
							/>
						</div>
						<div className="grid min-w-0 gap-2">
							<Label htmlFor="pay-date">Date</Label>
							<DatePicker
								id="pay-date"
								value={date}
								max={isoDate()}
								onChange={setDate}
							/>
						</div>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="pay-method">Paid by</Label>
						<Input
							id="pay-method"
							value={method}
							maxLength={60}
							onChange={(event) => setMethod(event.target.value)}
							placeholder="e.g. e-Transfer"
							autoComplete="off"
						/>
						{labels.length > 0 && (
							<div className="flex flex-wrap gap-1.5">
								{labels.slice(0, 6).map((line) => (
									<button
										key={line}
										type="button"
										onClick={() => setMethod(line)}
										className={cn(
											"h-6 rounded-full border px-2.5 text-xs transition-colors hover:bg-muted",
											method === line &&
												"border-primary bg-primary/10 text-primary hover:bg-primary/15"
										)}
									>
										{line}
									</button>
								))}
							</div>
						)}
					</div>
					<div className="grid gap-2">
						<Label htmlFor="pay-note">Note</Label>
						<Input
							id="pay-note"
							value={note}
							maxLength={300}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Optional"
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!valid || saving}>
							{saving && <Loader2 className="animate-spin" />}
							Record payment
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
