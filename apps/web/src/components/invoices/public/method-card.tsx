import { ExternalLink, Loader2, QrCode as QrIcon } from "lucide-react"
import { useState } from "react"
import { toastError } from "@/lib/toast"
import { QrCode } from "@/components/common/qr-code"
import { Button } from "@/components/ui/button"
import {
	publicApi,
	type PublicInvoice,
	type PublicPaymentMethod,
} from "@/lib/api"
import { invoiceMoney, methodLines, payLink, qrValue } from "@/lib/invoice"
import { CopyButton } from "@/components/invoices/public/layout-bits"

/** React/UI entry: `PublicMethodCard`. */
export function PublicMethodCard({
	method,
	invoice: inv,
	token,
}: {
	method: PublicPaymentMethod
	invoice: PublicInvoice
	token: string
}) {
	const [starting, setStarting] = useState(false)
	const [showQr, setShowQr] = useState(method.kind === "crypto")

	if (method.kind === "paypal-checkout") {
		async function start() {
			setStarting(true)
			try {
				const { url } = await publicApi.startPaypal(token)
				window.location.assign(url)
			} catch (error) {
				toastError((error as Error).message)
				setStarting(false)
			}
		}
		return (
			<div className="grid content-start gap-3 rounded-xl border bg-card p-4 sm:col-span-2">
				<div>
					<p className="font-medium">{method.label}</p>
					<p className="text-sm text-muted-foreground">
						Pay securely with your PayPal account or a debit or
						credit card.
					</p>
				</div>
				<Button
					size="lg"
					className="bg-[#ffc439] text-[#111] hover:bg-[#f2ba36]"
					onClick={() => void start()}
					disabled={starting}
				>
					{starting && <Loader2 className="animate-spin" />}
					Pay {invoiceMoney(inv.balance, inv.currency)} with PayPal
				</Button>
			</div>
		)
	}

	const lines = methodLines(method)
	const link = payLink(method, inv.balance, inv.currency)
	const qr = qrValue(method, inv.balance, inv.currency)

	return (
		<div className="grid content-start gap-2 rounded-xl border bg-card p-4">
			<div className="flex items-center justify-between gap-2">
				<p className="font-medium">{method.label}</p>
				{qr && (
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={showQr ? "Hide QR code" : "Show QR code"}
						aria-pressed={showQr}
						onClick={() => setShowQr((show) => !show)}
					>
						<QrIcon />
					</Button>
				)}
			</div>
			<dl className="grid gap-1 text-sm">
				{lines.map((line) => (
					<div
						key={line.label}
						className="flex min-w-0 items-center gap-2"
					>
						<dt className="shrink-0 text-muted-foreground">
							{line.label}
						</dt>
						<dd className="min-w-0 flex-1 font-medium break-all whitespace-pre-wrap">
							{line.value}
						</dd>
						{line.copy && (
							<CopyButton value={line.value} what={line.label} />
						)}
					</div>
				))}
			</dl>
			{showQr && qr && (
				<QrCode
					value={qr}
					label={`QR code for ${method.label}`}
					className="mt-1 size-36 rounded-lg p-1.5"
				/>
			)}
			{link && (
				<Button
					variant="outline"
					size="sm"
					className="mt-1 justify-self-start"
					render={<a href={link} target="_blank" rel="noreferrer" />}
					nativeButton={false}
				>
					<ExternalLink /> Pay with {method.label}
				</Button>
			)}
		</div>
	)
}
