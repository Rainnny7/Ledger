import { confirmDialog } from "@/lib/confirm"
import {
	Check,
	Copy,
	Download,
	ExternalLink,
	Loader2,
	Mail,
	RefreshCw,
	Send,
	Share2,
} from "lucide-react"
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
	const [busy, setBusy] = useState<"pdf" | "share" | "reset" | null>(null)
	// Remember which invoice was copied, so switching invoices drops the tick without an effect.
	const [copiedId, setCopiedId] = useState<string | null>(null)
	const copied = !!invoice && copiedId === invoice.id

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
			return toast.error("Couldn’t copy to the clipboard")
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

	const mailto = `mailto:${encodeURIComponent(inv.client.email)}?subject=${encodeURIComponent(`Invoice ${inv.number} from ${from}`)}&body=${encodeURIComponent(
		`${message}\n\nThanks!`
	)}`

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Send invoice {inv.number}</DialogTitle>
					<DialogDescription>
						{inv.client.name
							? `${inv.client.name} can`
							: "Whoever has the link can"}{" "}
						view it, download the PDF and see every way to pay.
						{inv.viewedAt &&
							` Opened ${formatShortDate(localDate(inv.viewedAt))}.`}
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="flex gap-2">
						<Input
							readOnly
							value={url}
							onFocus={(event) => event.currentTarget.select()}
							aria-label="Invoice link"
							className="font-mono text-xs"
						/>
						<Button
							onClick={() => void copyLink()}
							className="shrink-0"
						>
							{copied ? <Check /> : <Copy />}
							{copied ? "Copied" : "Copy link"}
						</Button>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<Button
							variant="outline"
							disabled={busy !== null}
							onClick={() => void sharePdf()}
						>
							{busy === "share" ? (
								<Loader2 className="animate-spin" />
							) : (
								<Share2 />
							)}
							{canShareFiles ? "Share PDF" : "Share"}
						</Button>
						<Button
							variant="outline"
							disabled={busy !== null}
							onClick={() => void download()}
						>
							{busy === "pdf" ? (
								<Loader2 className="animate-spin" />
							) : (
								<Download />
							)}
							Download PDF
						</Button>
						<Button
							variant="outline"
							render={
								<a
									href={mailto}
									onClick={() => void markSent()}
								/>
							}
							nativeButton={false}
						>
							<Mail /> Email
						</Button>
						<Button
							variant="outline"
							render={
								<a
									href={url}
									target="_blank"
									rel="noreferrer"
								/>
							}
							nativeButton={false}
						>
							<ExternalLink /> Open page
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Email opens your mail app with the link filled in. To
						attach the PDF, download it first or use Share on your
						phone.
					</p>
				</div>
				<DialogFooter className="sm:justify-between">
					<Button
						variant="ghost"
						size="sm"
						disabled={busy !== null}
						onClick={() => void resetLink()}
					>
						{busy === "reset" ? (
							<Loader2 className="animate-spin" />
						) : (
							<RefreshCw />
						)}
						New link
					</Button>
					{inv.status === "draft" ? (
						<Button
							size="sm"
							onClick={() =>
								void api
									.updateInvoice(inv.id, { status: "sent" })
									.then(() => toast.success("Marked as sent"))
									.catch(notifyFailure)
							}
						>
							<Send /> Mark as sent
						</Button>
					) : (
						<Button size="sm" variant="outline" onClick={onClose}>
							Done
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
