import { confirmDialog } from "@/lib/confirm"
import { useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { api, type Invoice, type PaymentMethod } from "@/lib/api"
import { formatShortDate, localDate } from "@/lib/format"
import { invoiceMoney, shareUrl } from "@/lib/invoice"
import { notifyFailure } from "@/components/invoices/notify"
import {
	pdfFileName,
	pdfSource,
	renderPdf,
	saveBlob,
} from "@/components/invoices/pdf-files"
import { copyText } from "@/lib/work"

/**
 * Share dialog handlers and derived copy for one invoice.
 */
export function useShareInvoiceDialog(
	invoice: Invoice | null,
	methods: PaymentMethod[]
) {
	const [busy, setBusy] = useState<"pdf" | "share" | "reset" | null>(null)
	const [copiedId, setCopiedId] = useState<string | null>(null)

	if (!invoice) {
		return null
	}

	const inv = invoice
	const url = shareUrl(inv.token)
	const money = invoiceMoney(
		inv.balance > 0 ? inv.balance : inv.total,
		inv.currency
	)
	const from = inv.from.name || "me"
	const message = `Hi${inv.client.name ? ` ${inv.client.name}` : ""}, here's invoice ${inv.number} for ${money}${
		inv.dueDate ? `, due ${formatShortDate(inv.dueDate)}` : ""
	}. You can view it, download the PDF and pay here: ${url}`
	const canShareFiles =
		typeof navigator !== "undefined" && !!navigator.canShare
	const copied = copiedId === inv.id
	const mailto = `mailto:${encodeURIComponent(inv.client.email)}?subject=${encodeURIComponent(`Invoice ${inv.number} from ${from}`)}&body=${encodeURIComponent(
		`${message}\n\nThanks!`
	)}`

	async function markSent() {
		if (inv.status !== "draft") {
			return
		}
		try {
			await api.updateInvoice(inv.id, { status: "sent" })
		} catch {
			/* the share itself worked; the status can be set later */
		}
	}

	async function copyLink() {
		if (!(await copyText(url))) {
			return toastError("Couldn’t copy to the clipboard")
		}
		setCopiedId(inv.id)
		toast.success("Link copied", {
			description: "Anyone with this link can view and pay the invoice.",
		})
		void markSent()
	}

	async function sharePdf() {
		setBusy("share")
		try {
			const blob = await renderPdf(pdfSource(inv, methods))
			const file = new File([blob], pdfFileName(inv), {
				type: "application/pdf",
			})
			const data: ShareData = {
				title: `Invoice ${inv.number}`,
				text: message,
				files: [file],
			}
			if (navigator.canShare?.(data)) {
				await navigator.share(data)
			} else if (navigator.share) {
				await navigator.share({ title: data.title, text: message, url })
			} else {
				return saveBlob(blob, file.name)
			}
			void markSent()
		} catch (error) {
			if ((error as Error).name !== "AbortError") {
				notifyFailure(error)
			}
		} finally {
			setBusy(null)
		}
	}

	async function download() {
		setBusy("pdf")
		try {
			saveBlob(await renderPdf(pdfSource(inv, methods)), pdfFileName(inv))
		} catch (error) {
			notifyFailure(error)
		} finally {
			setBusy(null)
		}
	}

	async function resetLink() {
		if (
			!(await confirmDialog({
				title: "Make a new link?",
				description:
					"The old one stops working, so anyone you sent it to will need the new one.",
				action: "Make new link",
			}))
		) {
			return
		}
		setBusy("reset")
		try {
			await api.resetInvoiceLink(inv.id)
			setCopiedId(null)
			toast.success("New link made")
		} catch (error) {
			notifyFailure(error)
		} finally {
			setBusy(null)
		}
	}

	async function markSentExplicit() {
		await api
			.updateInvoice(inv.id, { status: "sent" })
			.then(() => toast.success("Marked as sent"))
			.catch(notifyFailure)
	}

	return {
		inv,
		url,
		message,
		canShareFiles,
		copied,
		busy,
		mailto,
		copyLink,
		sharePdf,
		download,
		resetLink,
		markSent,
		markSentExplicit,
		viewedDescription:
			inv.viewedAt &&
			` Opened ${formatShortDate(localDate(inv.viewedAt))}.`,
	}
}
