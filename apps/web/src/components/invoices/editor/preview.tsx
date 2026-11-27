import { Loader2 } from "lucide-react"
import { DownloadIcon } from "@/components/icons/download"
import { ExternalLinkIcon } from "@/components/icons/external-link"
import { EyeIcon } from "@/components/icons/eye"
import { useEffect, useEffectEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import type { InvoicePdfSource } from "@/lib/invoice-pdf-data"
import { renderPdf, saveBlob } from "@/components/invoices/pdf-files"

function useBlobUrl(blob: Blob | null) {
	const [url, setUrl] = useState<string | null>(null)
	useEffect(() => {
		if (!blob) {
			// oxlint-disable-next-line react/set-state-in-effect -- revoke prior object URL when blob clears
			setUrl((prev) => {
				if (prev) {
					URL.revokeObjectURL(prev)
				}
				return null
			})
			return
		}
		const next = URL.createObjectURL(blob)
		setUrl(next)
		return () => URL.revokeObjectURL(next)
	}, [blob])
	return url
}

/**
 * The real PDF, re-drawn a moment after you stop typing. Phones can't show PDFs inline,
 * so there it's a button that opens the PDF in a new tab.
 */
export function InvoicePreview({
	source,
	fileName,
}: {
	source: InvoicePdfSource
	fileName: string
}) {
	const [blob, setBlob] = useState<Blob | null>(null)
	const [error, setError] = useState<string | null>(null)
	const key = JSON.stringify(source)
	const [drawnKey, setDrawnKey] = useState<string | null>(null)
	const busy = drawnKey !== key
	const draw = useEffectEvent(() => renderPdf(source))
	const url = useBlobUrl(blob)

	useEffect(() => {
		let cancelled = false
		const timer = setTimeout(() => {
			draw()
				.then((bytes) => {
					if (cancelled) {
						return
					}
					setBlob(bytes)
					setError(null)
				})
				.catch(
					(renderError: Error) =>
						!cancelled && setError(renderError.message)
				)
				.finally(() => !cancelled && setDrawnKey(key))
		}, 450)
		return () => {
			cancelled = true
			clearTimeout(timer)
			setBlob(null)
		}
	}, [key])

	const actions = (
		<div className="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={!url}
				render={
					<a
						href={url ?? undefined}
						target="_blank"
						rel="noreferrer"
						aria-label="Open invoice PDF in new tab"
					/>
				}
				nativeButton={false}
			>
				<ExternalLinkIcon size={24} className="flex" /> Open
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={!blob}
				onClick={() => blob && saveBlob(blob, fileName)}
			>
				<DownloadIcon size={24} className="flex" /> Download
			</Button>
		</div>
	)

	return (
		<div className="grid gap-2 lg:sticky lg:top-20">
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-2 text-sm font-medium">
					<EyeIcon size={16} className="flex text-muted-foreground" />{" "}
					Preview
					{busy && (
						<Loader2 className="size-3.5 animate-spin text-muted-foreground" />
					)}
				</span>
				{actions}
			</div>
			{error && (
				<p className="text-sm text-destructive">
					Couldn’t draw the PDF: {error}
				</p>
			)}
			<div className="hidden overflow-hidden rounded-xl border bg-muted/40 lg:block">
				{url ? (
					// oxlint-disable-next-line react/iframe-missing-sandbox, react-doctor/iframe-missing-sandbox -- blob PDF preview; sandbox blanks the browser PDF viewer
					<iframe
						title="Invoice PDF preview"
						src={`${url}#toolbar=0&navpanes=0&view=FitH`}
						className="aspect-[210/297] w-full bg-white"
					/>
				) : (
					<div className="flex aspect-[210/297] items-center justify-center">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				)}
			</div>
			<p className="text-xs text-muted-foreground lg:hidden">
				Open the preview to see the PDF exactly as it will be sent.
			</p>
		</div>
	)
}
