import { AppLoader } from "@/components/layout/app-loader"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { parseAsString, useQueryStates } from "nuqs"
import { useParams } from "@tanstack/react-router"
import { URL_OPTIONS } from "@/lib/url-state"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { publicApi } from "@/lib/api"
import { PublicInvoiceShell } from "@/components/invoices/public/shell"
import { PublicInvoiceView } from "@/components/invoices/public/invoice-view"

const key = (token: string) => ["public-invoice", token] as const

/** The page the person you billed opens: the invoice, the PDF, and every way to pay. No sign-in. */
export function PublicInvoicePage() {
	const { token = "" } = useParams({ strict: false })
	const [back, setBack] = useQueryStates(
		{ paypal: parseAsString, token: parseAsString },
		URL_OPTIONS
	)
	const client = useQueryClient()
	const { data, error, isPending } = useQuery({
		queryKey: key(token),
		queryFn: () => publicApi.invoice(token),
		retry: false,
	})
	const capture = useMutation({
		mutationFn: (orderId: string) =>
			publicApi.capturePaypal(token, orderId),
		onSuccess: ({ invoice }) => {
			if (invoice) {
				client.setQueryData(key(token), { invoice })
			}
			toast.success("Payment received. Thank you!")
		},
		onError: (captureError: Error) => toastError(captureError.message),
	})
	const { mutate: startCapture } = capture
	const handled = useRef(false)

	useEffect(() => {
		document.title = data
			? `Invoice ${data.invoice.number}${data.invoice.from.name ? ` · ${data.invoice.from.name}` : ""}`
			: "Invoice"
	}, [data])

	useEffect(() => {
		const { paypal: flow, token: orderId } = back
		if (!flow || handled.current) {
			return
		}
		handled.current = true
		void setBack(null)
		if (flow === "cancel") {
			return void toast("PayPal payment cancelled", {
				description: "Nothing was charged.",
			})
		}
		if (flow !== "return" || !orderId) {
			return
		}
		startCapture(orderId)
	}, [back, setBack, startCapture])

	if (isPending) {
		return (
			<PublicInvoiceShell>
				<AppLoader />
			</PublicInvoiceShell>
		)
	}
	if (error || !data) {
		return (
			<PublicInvoiceShell>
				<div className="mx-auto max-w-md py-24 text-center">
					<p className="text-lg font-semibold">Invoice not found</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{error?.message ??
							"This link is not valid any more. Ask the sender for a new one."}
					</p>
				</div>
			</PublicInvoiceShell>
		)
	}

	return (
		<PublicInvoiceShell>
			<PublicInvoiceView
				invoice={data.invoice}
				token={token}
				capturing={capture.isPending}
			/>
		</PublicInvoiceShell>
	)
}
