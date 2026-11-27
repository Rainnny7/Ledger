import { Dialog, DialogContent } from "@/components/ui/dialog"
import { type PaymentMethod, type PaypalAppConnection } from "@/lib/api"
import { PaymentMethodDialogForm } from "@/components/invoices/payment-method-dialog-form"
import { usePaymentMethodDialog } from "@/components/invoices/use-payment-method-dialog"

/** Add or edit one way of getting paid. Saved methods can be ticked on any invoice. */
export function PaymentMethodDialog({
	open,
	method,
	paypal,
	onClose,
	onSaved,
}: {
	open: boolean
	method: PaymentMethod | null
	paypal: PaypalAppConnection[]
	onClose: () => void
	onSaved?: (method: PaymentMethod) => void
}) {
	const form = usePaymentMethodDialog({
		open,
		method,
		paypal,
		onClose,
		onSaved,
	})

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
				<PaymentMethodDialogForm form={form} onClose={onClose} />
			</DialogContent>
		</Dialog>
	)
}
