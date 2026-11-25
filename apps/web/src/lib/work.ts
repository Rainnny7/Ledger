import type { WorkInvoice, WorkPayment } from "@/lib/api"
import { formatMoney, formatShortDate } from "@/lib/format"
import { mulMoney, roundTo } from "@ledger/shared/money"

/**
 * Hours typed the way people write them: "63", "43.6", "3:30", "120h 30m", "2h", "45m", "1 hr 15 min".
 * Returns null when it can't make sense of it.
 */
export function parseHours(input: string): number | null {
	let normalized = input.trim().toLowerCase()
	// "1,234.5" is thousands separators; a lone comma ("43,6") is a decimal point.
	normalized = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)
		? normalized.replace(/,/g, "")
		: normalized.replace(/,/g, ".")
	if (!normalized) {
		return null
	}
	if (/^\d+(\.\d+)?$/.test(normalized)) {
		return Number(normalized)
	}
	const colon = /^(\d+):([0-5]?\d)$/.exec(normalized)
	if (colon) {
		return Number(colon[1]) + Number(colon[2]) / 60
	}
	const hm =
		/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?$/.exec(
			normalized
		)
	if (hm && (hm[1] || hm[2])) {
		return Number(hm[1] ?? 0) + Number(hm[2] ?? 0) / 60
	}
	return null
}

/** 63 → "63", 43.6 → "43.6", 3.333… → "3.33", 1234.5 → "1,234.5". */
export const formatHours = (hours: number) =>
	roundTo(hours, 2).toLocaleString("en-US", { maximumFractionDigits: 2 })

/** The same, without separators, for putting back into an input. */
export const hoursInput = (hours: number) => String(roundTo(hours, 2))

/** "63 hrs" / "1 hr" / "3 hrs 20 min" for display. */
export function formatDuration(hours: number) {
	const whole = Math.floor(hours + 1e-9)
	const min = Math.round((hours - whole) * 60)
	const hrs = `${whole} hr${whole === 1 ? "" : "s"}`
	if (min === 0) {
		return hrs
	}
	if (whole === 0) {
		return `${min} min`
	}
	return `${hrs} ${min} min`
}

const hoursLabel = (hours: number) =>
	`${formatHours(hours)} hr${roundTo(hours, 2) === 1 ? "" : "s"}`

/** The update for one payment: "Received $250.00 on Nov 9 · $750.00 left on this bill". */
export function paymentLine(
	payment: Pick<WorkPayment, "amount" | "date" | "remainingAfter">,
	currency: string
) {
	const left =
		payment.remainingAfter > 0.005
			? `${formatMoney(payment.remainingAfter, currency)} left on this bill`
			: "paid in full, thank you!"
	return `Received ${formatMoney(payment.amount, currency)} on ${formatShortDate(payment.date)} · ${left}`
}

/**
 * The whole bill as a message to paste into a chat or email:
 *
 *   Hours for Nov 24
 *   43.5 hrs × $28.50/hr = $1,239.75
 *   Hour tracker now at 320.5 hrs
 *   Proof: https://…
 *
 *   Payments so far
 *   • Nov 9 — $250.00
 *   • Nov 16 — $250.00
 *
 *   Paid $500.00 of $1,239.75 · $739.75 left
 */
export function invoiceText(invoice: WorkInvoice, currency: string) {
	const format = (amount: number) => formatMoney(amount, currency)
	const agreed =
		Math.abs(invoice.total - mulMoney(invoice.rate, invoice.hours)) > 0.005
	const head = [
		`Hours for ${formatShortDate(invoice.date)}`,
		agreed
			? `${hoursLabel(invoice.hours)} at ${format(invoice.rate)}/hr · agreed total ${format(invoice.total)}`
			: `${hoursLabel(invoice.hours)} × ${format(invoice.rate)}/hr = ${format(invoice.total)}`,
	]
	if (invoice.counterHours !== null) {
		head.push(`Hour tracker now at ${hoursLabel(invoice.counterHours)}`)
	}
	if (invoice.proofUrl) {
		head.push(`Proof: ${invoice.proofUrl}`)
	}
	const blocks = [head.join("\n")]

	if (invoice.payments.length > 0) {
		blocks.push(
			[
				"Payments so far",
				...invoice.payments.map(
					(payment) =>
						`• ${formatShortDate(payment.date)} — ${format(payment.amount)}`
				),
			].join("\n")
		)
	}

	if (invoice.remaining <= 0.005) {
		blocks.push(
			`Paid in full${invoice.paidAt ? ` on ${formatShortDate(invoice.paidAt)}` : ""}, thank you!`
		)
	} else if (invoice.paid > 0) {
		blocks.push(
			`Paid ${format(invoice.paid)} of ${format(invoice.total)} · ${format(invoice.remaining)} left`
		)
	} else {
		blocks.push(`Total due: ${format(invoice.total)}`)
	}
	return blocks.join("\n\n")
}

/** Common pay cadences for work jobs. */
export const EVERY_PRESETS = [
	{ days: 7, label: "Weekly" },
	{ days: 14, label: "Every 2 weeks" },
	{ days: 30, label: "Monthly" },
] as const

/** "weekly", "every 2 weeks", "every 10 days" — how often a job pays. */
export function payEveryLabel(days: number) {
	const preset = EVERY_PRESETS.find((entry) => entry.days === days)
	return preset ? preset.label.toLowerCase() : `every ${days} days`
}

/** Copy to the clipboard when the browser allows; otherwise false. */
export async function copyText(text: string) {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		return false
	}
}
