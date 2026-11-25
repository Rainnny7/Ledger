import { mulMoney, roundTo } from "@ledger/shared/money"
import { hoursInput, parseHours } from "@/lib/work"
import type { WorkInvoice, WorkJob } from "@/lib/api"

/** React/UI entry: `workInvoiceLastCounter`. */
export function workInvoiceLastCounter(
	job: WorkJob,
	editing: WorkInvoice | undefined
) {
	const prior = job.invoices.filter(
		(item) =>
			item.id !== editing?.id &&
			item.counterHours !== null &&
			(!editing || item.date <= editing.date)
	)
	return prior[0]?.counterHours ?? null
}

/** React/UI entry: `fillWorkInvoiceFromDraft`. */
export function fillWorkInvoiceFromDraft(draft: {
	job: WorkJob
	invoice?: WorkInvoice
}) {
	const { job, invoice } = draft
	const mode: "hours" | "tracker" = invoice
		? invoice.counterHours !== null
			? "tracker"
			: "hours"
		: job.lastCounter !== null && job.unbilledHours === 0
			? "tracker"
			: "hours"
	return {
		mode,
		hours: invoice
			? hoursInput(invoice.hours)
			: job.unbilledHours > 0
				? hoursInput(job.unbilledHours)
				: "",
		counter:
			invoice?.counterHours != null
				? hoursInput(invoice.counterHours)
				: "",
		rate: String(invoice?.rate ?? job.rate),
		total: invoice ? String(invoice.total) : "",
		totalTouched:
			!!invoice &&
			Math.abs(invoice.total - mulMoney(invoice.rate, invoice.hours)) >
				0.005,
		date: invoice?.date ?? "",
		proof: invoice?.proofUrl ?? "",
		note: invoice?.note ?? "",
	}
}

/** React/UI entry: `workInvoiceHoursN`. */
export function workInvoiceHoursN(
	mode: "hours" | "tracker",
	counterN: number | null,
	lastCounter: number | null,
	hours: string
) {
	if (mode === "tracker") {
		if (counterN !== null && lastCounter !== null) {
			return roundTo(counterN - lastCounter, 2)
		}
		if (counterN !== null && lastCounter === null) {
			return parseHours(hours)
		}
		return null
	}
	return parseHours(hours)
}
