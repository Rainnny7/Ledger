import { notifyFailure } from "@/components/work/dialogs/form"
import { roundMoney, roundTo } from "@ledger/shared/money"
import { api, type WorkInvoice, type WorkJob } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { formatDuration } from "@/lib/work"
import { toast } from "sonner"

/** React/UI entry: `saveWorkInvoice`. */
export async function saveWorkInvoice(opts: {
	job: WorkJob
	editing: WorkInvoice | undefined
	mode: "hours" | "tracker"
	hoursN: number
	rateN: number
	totalN: number
	counterN: number | null
	lastCounter: number | null
	date: string
	proof: string
	note: string
	includeShifts: boolean
	shifts: { id: string }[]
}) {
	const counterHours =
		opts.mode === "tracker"
			? roundTo(opts.counterN!, 2)
			: opts.lastCounter !== null
				? roundTo(opts.lastCounter + opts.hoursN, 2)
				: null
	const body = {
		date: opts.date,
		hours: roundTo(opts.hoursN, 2),
		rate: roundMoney(opts.rateN),
		total: roundMoney(opts.totalN),
		counterHours,
		proofUrl: opts.proof.trim() || null,
		note: opts.note.trim() || null,
	}
	if (opts.editing) {
		await api.updateWorkInvoice(opts.editing.id, body)
		toast.success("Bill updated")
		return
	}
	await api.createWorkInvoice(opts.job.id, {
		...body,
		entryIds: opts.includeShifts
			? opts.shifts.map((shift) => shift.id)
			: [],
	})
	toast.success(`Billed ${formatMoney(body.total, opts.job.currency)}`, {
		description: `${formatDuration(body.hours)} for ${opts.job.name}`,
	})
}

/** React/UI entry: `runWorkInvoiceSave`. */
export async function runWorkInvoiceSave(
	...args: Parameters<typeof saveWorkInvoice>
) {
	try {
		await saveWorkInvoice(...args)
		return true
	} catch (error) {
		notifyFailure(error)
		return false
	}
}
