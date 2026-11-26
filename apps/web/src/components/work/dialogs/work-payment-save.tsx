import { notifyFailure } from "@/components/work/dialogs/form"
import { CopyIcon } from "@/components/icons/copy"
import { roundMoney } from "@ledger/shared/money"
import { api, type WorkJob } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { copyText, paymentLine } from "@/lib/work"

import { toast } from "sonner"
import { toastError } from "@/lib/toast"

/** React/UI entry: `saveWorkPayment`. */
export async function saveWorkPayment(opts: {
	job: WorkJob
	invoiceId: string
	invoicePayments: { id: string }[]
	value: number
	date: string
	note: string
	transactionId: string | null | undefined
	converted: boolean
	receivedN: number
	receivedCurrency: string
}) {
	const before = new Set(opts.invoicePayments.map((payment) => payment.id))
	const { job: updated } = await api.addWorkPayment(opts.invoiceId, {
		amount: roundMoney(opts.value),
		date: opts.date,
		note: opts.note.trim() || null,
		transactionId: opts.transactionId ?? null,
		...(opts.converted &&
		opts.receivedN > 0 &&
		opts.receivedCurrency !== opts.job.currency
			? {
					receivedAmount: roundMoney(opts.receivedN),
					receivedCurrency: opts.receivedCurrency,
				}
			: {}),
	})
	const invoice = updated.invoices.find((row) => row.id === opts.invoiceId)
	const added = invoice?.payments.find((payment) => !before.has(payment.id))
	const line = added ? paymentLine(added, opts.job.currency) : null
	const cleared = invoice?.status === "paid"
	toast.success(
		cleared
			? `🎉 Bill cleared — ${formatMoney(invoice!.total, opts.job.currency)} paid in full`
			: `${formatMoney(opts.value, opts.job.currency)} received`,
		{
			description: cleared
				? undefined
				: `${formatMoney(invoice?.remaining ?? 0, opts.job.currency)} left on this bill`,
			duration: 8000,
			action: line
				? {
						label: (
							<span className="flex items-center gap-1">
								<CopyIcon size={12} className="flex" /> Copy
								update
							</span>
						),
						onClick: () =>
							void copyText(line).then((ok) =>
								ok
									? toast.success("Copied", {
											description: line,
										})
									: toastError("Couldn’t copy")
							),
					}
				: undefined,
		}
	)
}

/** React/UI entry: `runWorkPaymentSave`. */
export async function runWorkPaymentSave(
	...args: Parameters<typeof saveWorkPayment>
) {
	try {
		await saveWorkPayment(...args)
		return true
	} catch (error) {
		notifyFailure(error)
		return false
	}
}
