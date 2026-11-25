import type { WorkPaymentDraft } from "@/components/work/dialogs/payment-dialog"
import { fillWorkPaymentFromDraft } from "@/components/work/dialogs/work-payment-fill"
import {
	openWorkInvoices,
	workPaymentQuickAmounts,
	workPaymentSelectItems,
} from "@/components/work/dialogs/work-payment-options"
import { runDialogSave } from "@/components/work/dialogs/run-dialog-save"
import { runWorkPaymentSave } from "@/components/work/dialogs/work-payment-save"
import {
	sanitizeMoneyInput,
	isIsoDateString,
} from "@/components/work/dialogs/form"
import { roundMoney } from "@ledger/shared/money"
import { convertAmount, useFx } from "@/lib/currency"
import { getDisplayCurrency, isoDate } from "@/lib/format"
import { useDialogDraftFill } from "@/components/work/dialogs/use-dialog-draft-fill"
import { useMemo, useState } from "react"

/** React/UI entry: `useWorkPaymentDialog`. */
export function useWorkPaymentDialog(
	draft: WorkPaymentDraft | null,
	onClose: () => void
) {
	const job = draft?.job
	const open = useMemo(() => (job ? openWorkInvoices(job) : []), [job])
	const [invoiceId, setInvoiceId] = useState("")
	const [amount, setAmount] = useState("")
	const [date, setDate] = useState(isoDate)
	const [note, setNote] = useState("")
	const [converted, setConverted] = useState(false)
	const [received, setReceived] = useState("")
	const [receivedCurrency, setReceivedCurrency] = useState(getDisplayCurrency)
	const [saving, setSaving] = useState(false)
	const fx = useFx()
	const invoice =
		open.find((item) => item.id === invoiceId) ??
		job?.invoices.find((item) => item.id === invoiceId)

	useDialogDraftFill(draft, (value) => {
		const filled = fillWorkPaymentFromDraft(value)
		setInvoiceId(filled.invoiceId)
		setAmount(filled.amount)
		setDate(filled.date || isoDate())
		setNote(filled.note)
		setConverted(filled.converted)
		setReceived("")
		setReceivedCurrency(filled.receivedCurrency)
	})

	const value = Number(amount)
	const receivedN = Number(received)
	const receivedValid =
		!converted || !received || (Number.isFinite(receivedN) && receivedN > 0)
	const estimate =
		job && value > 0
			? convertAmount(value, job.currency, receivedCurrency, fx)
			: null
	const valid =
		!!invoice &&
		Number.isFinite(value) &&
		value > 0 &&
		isIsoDateString(date) &&
		receivedValid
	const after = invoice ? roundMoney(invoice.remaining - (value || 0)) : 0
	const items = job ? workPaymentSelectItems(job, open) : []
	const quick = workPaymentQuickAmounts(job, invoice)

	function save(event: React.FormEvent) {
		if (!job || !invoice || !valid) {
			return
		}
		void runDialogSave(
			setSaving,
			() =>
				runWorkPaymentSave({
					job,
					invoiceId: invoice.id,
					invoicePayments: invoice.payments,
					value,
					date,
					note,
					transactionId: draft?.transactionId,
					converted,
					receivedN,
					receivedCurrency,
				}),
			onClose,
			event
		)
	}

	return {
		job,
		open,
		invoiceId,
		setInvoiceId,
		amount,
		setAmountInput: (typed: string) => setAmount(sanitizeMoneyInput(typed)),
		setAmountQuick: (quickAmount: string) => setAmount(quickAmount),
		date,
		setDate,
		note,
		setNote,
		converted,
		setConverted,
		received,
		setReceived: (typed: string) => setReceived(sanitizeMoneyInput(typed)),
		receivedCurrency,
		setReceivedCurrency,
		saving,
		save,
		valid,
		invoice,
		after,
		items,
		quick,
		value,
		receivedN,
		estimate,
	}
}
