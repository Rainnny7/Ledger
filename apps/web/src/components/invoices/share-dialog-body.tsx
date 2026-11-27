import { CheckIcon } from "@/components/icons/check"
import { CopyIcon } from "@/components/icons/copy"
import { DownloadIcon } from "@/components/icons/download"
import { ExternalLinkIcon } from "@/components/icons/external-link"
import { MailIcon } from "@/components/icons/mail"
import { Share2Icon } from "@/components/icons/share-2"
import { Loader2, RefreshCw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { useShareInvoiceDialog } from "@/components/invoices/use-share-invoice-dialog"

type ShareState = NonNullable<ReturnType<typeof useShareInvoiceDialog>>

/** Share dialog header, link row, and action buttons. */
export function ShareDialogBody({
	share,
	onClose,
}: {
	share: ShareState
	onClose: () => void
}) {
	const { inv } = share

	return (
		<>
			<DialogHeader>
				<DialogTitle>Send invoice {inv.number}</DialogTitle>
				<DialogDescription>
					{inv.client.name
						? `${inv.client.name} can`
						: "Whoever has the link can"}{" "}
					view it, download the PDF and see every way to pay.
					{share.viewedDescription}
				</DialogDescription>
			</DialogHeader>
			<div className="grid gap-4">
				<div className="flex gap-2">
					<Input
						readOnly
						value={share.url}
						onFocus={(event) => event.currentTarget.select()}
						aria-label="Invoice link"
						className="font-mono text-xs"
					/>
					<Button
						onClick={() => void share.copyLink()}
						className="shrink-0"
					>
						{share.copied ? (
							<CheckIcon size={24} className="flex" />
						) : (
							<CopyIcon size={24} className="flex" />
						)}
						{share.copied ? "Copied" : "Copy link"}
					</Button>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Button
						variant="outline"
						disabled={share.busy !== null}
						onClick={() => void share.sharePdf()}
					>
						{share.busy === "share" ? (
							<Loader2 className="animate-spin" />
						) : (
							<Share2Icon size={24} className="flex" />
						)}
						{share.canShareFiles ? "Share PDF" : "Share"}
					</Button>
					<Button
						variant="outline"
						disabled={share.busy !== null}
						onClick={() => void share.download()}
					>
						{share.busy === "pdf" ? (
							<Loader2 className="animate-spin" />
						) : (
							<DownloadIcon size={24} className="flex" />
						)}
						Download PDF
					</Button>
					<Button
						variant="outline"
						render={
							<a
								href={share.mailto}
								onClick={() => void share.markSent()}
								aria-label="Email invoice link"
							/>
						}
						nativeButton={false}
					>
						<MailIcon size={24} className="flex" /> Email
					</Button>
					<Button
						variant="outline"
						render={
							<a
								href={share.url}
								target="_blank"
								rel="noreferrer"
								aria-label="Open public invoice page"
							/>
						}
						nativeButton={false}
					>
						<ExternalLinkIcon size={24} className="flex" /> Open
						page
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					Email opens your mail app with the link filled in. To attach
					the PDF, download it first or use Share on your phone.
				</p>
			</div>
			<DialogFooter className="sm:justify-between">
				<Button
					variant="ghost"
					size="sm"
					disabled={share.busy !== null}
					onClick={() => void share.resetLink()}
				>
					{share.busy === "reset" ? (
						<Loader2 className="animate-spin" />
					) : (
						<RefreshCw />
					)}
					New link
				</Button>
				{inv.status === "draft" ? (
					<Button
						size="sm"
						onClick={() => void share.markSentExplicit()}
					>
						<Send /> Mark as sent
					</Button>
				) : (
					<Button size="sm" variant="outline" onClick={onClose}>
						Done
					</Button>
				)}
			</DialogFooter>
		</>
	)
}
