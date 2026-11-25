import type { Invoice, InvoiceInput, InvoiceParty, WorkJob } from "@/lib/api"
import type { InvoicesData } from "@/lib/api"
import { addDays, daysFromToday, formatShortDate, isoDate } from "@/lib/format"
import { EMPTY_PARTY } from "@/lib/invoice"
import { mulMoney, roundMoney, roundTo } from "@ledger/shared/money"
import { formatHours } from "@/lib/work"

/** Line items as typed: numbers stay strings until saved, so "1." or "" don't jump around. */
export interface ItemDraft {
	key: number
	description: string
	quantity: string
	unitPrice: string
}

/** Shape for `Draft` used across this module. */
export type Draft = Omit<InvoiceInput, "items"> & { items: ItemDraft[] }

let itemKey = 0
/** `newItem` helper or constant for this feature area. */
export const newItem = (
	description = "",
	quantity = "1",
	unitPrice = ""
): ItemDraft => ({
	key: ++itemKey,
	description,
	quantity,
	unitPrice,
})

/** Parse a numeric string for invoice line math; non-finite input becomes 0. */
export const parseNumber = (input: string) => {
	const parsed = Number(input)
	return Number.isFinite(parsed) ? parsed : 0
}

/** Keep only digits, one decimal point, and a leading minus for typed money fields. */
export const sanitizeDecimalInput = (input: string) =>
	input
		.replace(/[^\d.-]/g, "")
		.replace(/(?!^)-/g, "")
		.replace(/(\..*)\./g, "$1")

/** `toItems` helper or constant for this feature area. */
export const toItems = (items: ItemDraft[]) =>
	items
		.filter(
			(item) => item.description.trim() || parseNumber(item.unitPrice)
		)
		.map((item) => ({
			description: item.description.trim(),
			quantity: roundTo(parseNumber(item.quantity), 3),
			unitPrice: roundMoney(parseNumber(item.unitPrice)),
		}))

/** `DUE_PRESETS` helper or constant for this feature area. */
export const DUE_PRESETS = [
	{ days: 0, label: "On receipt" },
	{ days: 7, label: "7 days" },
	{ days: 14, label: "14 days" },
	{ days: 30, label: "30 days" },
] as const

/** A fresh invoice from your saved details, a copy of another one, or a Work bill. */
export function startDraft(
	data: InvoicesData,
	opts: { source?: Invoice; bill?: { job: WorkJob; billId: string } }
): Draft {
	const profile = data.profile
	const today = isoDate()
	const defaults = data.methods
		.filter((method) => method.isDefault)
		.map((method) => method.id)
	const base: Draft = {
		number: data.nextNumber,
		status: "draft",
		template: profile.template,
		theme: profile.theme,
		currency: profile.currency,
		issueDate: today,
		dueDate:
			profile.dueDays === null ? null : addDays(today, profile.dueDays),
		from: profile.from,
		client: EMPTY_PARTY,
		items: [newItem()],
		taxRate: profile.taxRate,
		taxLabel: profile.taxLabel,
		discount: 0,
		notes: profile.notes || null,
		terms: profile.terms || null,
		methodIds: defaults,
		workInvoiceId: null,
	}
	const src = opts.source
	if (src) {
		const span = src.dueDate
			? Math.max(
					0,
					-daysFromToday(src.dueDate) + daysFromToday(src.issueDate)
				)
			: null
		return {
			...base,
			...src,
			number: data.nextNumber,
			status: "draft",
			issueDate: today,
			dueDate: span === null ? null : addDays(today, span),
			items: src.items.map((item) =>
				newItem(
					item.description,
					String(item.quantity),
					String(item.unitPrice)
				)
			),
			workInvoiceId: null,
		}
	}
	const bill =
		opts.bill &&
		opts.bill.job.invoices.find(
			(candidate) => candidate.id === opts.bill!.billId
		)
	if (opts.bill && bill) {
		const { job } = opts.bill
		const agreed =
			Math.abs(bill.total - mulMoney(bill.rate, bill.hours)) > 0.005
		const what = `${job.name}: ${formatHours(bill.hours)} hrs${bill.note ? ` (${bill.note})` : ""}, up to ${formatShortDate(bill.date)}`
		return {
			...base,
			currency: job.currency,
			client: { ...EMPTY_PARTY, name: job.name },
			items: agreed
				? [newItem(what, "1", String(bill.total))]
				: [newItem(what, String(bill.hours), String(bill.rate))],
			workInvoiceId: bill.id,
		}
	}
	return base
}

/** People you've billed before, newest first, for one-tap filling. */
export function recentClients(invoices: Invoice[]): InvoiceParty[] {
	const seen = new Map<string, InvoiceParty>()
	for (const inv of invoices) {
		if (inv.client.name && !seen.has(inv.client.name.toLowerCase())) {
			seen.set(inv.client.name.toLowerCase(), inv.client)
		}
	}
	return [...seen.values()].slice(0, 6)
}
