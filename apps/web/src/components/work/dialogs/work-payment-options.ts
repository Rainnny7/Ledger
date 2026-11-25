import type { WorkJob } from "@/lib/api"
import { formatMoney, formatShortDate } from "@/lib/format"

/** React/UI entry: `openWorkInvoices`. */
export function openWorkInvoices(job: WorkJob) {
	return job.invoices
		.filter((invoice) => invoice.status !== "paid")
		.toReversed()
}

/** React/UI entry: `workPaymentSelectItems`. */
export function workPaymentSelectItems(
	job: WorkJob,
	open: ReturnType<typeof openWorkInvoices>
) {
	return open.map((invoice) => ({
		value: invoice.id,
		label: `${formatShortDate(invoice.date)} · ${formatMoney(invoice.remaining, job.currency)} left of ${formatMoney(invoice.total, job.currency)}`,
	}))
}

/** React/UI entry: `workPaymentQuickAmounts`. */
export function workPaymentQuickAmounts(
	job: WorkJob | undefined,
	invoice: { remaining: number } | undefined
) {
	if (!invoice) {
		return []
	}
	return [
		job?.payAmount &&
			job.payAmount < invoice.remaining && {
				label: "Usual",
				value: job.payAmount,
			},
		{ label: "The rest", value: invoice.remaining },
	].filter((q): q is { label: string; value: number } => !!q && q.value > 0)
}
