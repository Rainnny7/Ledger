import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ShareDialogBody } from "@/components/invoices/share-dialog-body"
import { useShareInvoiceDialog } from "@/components/invoices/use-share-invoice-dialog"
import type { Invoice, PaymentMethod } from "@/lib/api"

/**
 * Send the invoice: copy the link, share the PDF through the phone's share sheet, email it, or download it.
 * Sharing a draft marks it as sent, since that's what you're doing.
 */
export function ShareDialog({
	invoice,
	methods,
	onClose,
}: {
	invoice: Invoice | null
	methods: PaymentMethod[]
	onClose: () => void
}) {
	const share = useShareInvoiceDialog(invoice, methods)
	if (!share) {
		return null
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<ShareDialogBody share={share} onClose={onClose} />
			</DialogContent>
		</Dialog>
	)
}
