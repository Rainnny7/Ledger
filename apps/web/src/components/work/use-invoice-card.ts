import { confirmDialog } from "@/lib/confirm"
import { useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { api, type WorkInvoice, type WorkJob } from "@/lib/api"
import { demoMode } from "@/lib/demo"
import { formatMoney } from "@/lib/format"
import type { JobActions } from "@/components/work/job-actions"

const fail = (error: unknown) => toastError((error as Error).message)
const readOnly = () =>
	toastError("Demo mode is read-only. Exit demo mode to make changes.")

async function removePayment(id: string) {
	if (demoMode) {
		return readOnly()
	}
	try {
		await api.deleteWorkPayment(id)
		toast.success("Payment removed")
	} catch (error) {
		fail(error)
	}
}

/**
 * Invoice card UI state and delete-bill handler.
 */
export function useInvoiceCard({
	job,
	invoice,
	onBill,
	onPay,
}: {
	job: WorkJob
	invoice: WorkInvoice
	onBill: JobActions["onBill"]
	onPay: JobActions["onPay"]
}) {
	const money = (amount: number) => formatMoney(amount, job.currency)
	const [showAll, setShowAll] = useState(false)
	const payments = invoice.payments.toReversed()
	const shown = showAll ? payments : payments.slice(0, 4)
	const readonly = job.access === "view"
	const owner = job.access === "owner"

	async function remove() {
		const paymentCount = invoice.payments.length
		if (
			!(await confirmDialog({
				title: `Delete this ${money(invoice.total)} bill?`,
				description: `${paymentCount ? `Its ${paymentCount} payment${paymentCount === 1 ? "" : "s"} are deleted too. ` : ""}Logged shifts on it go back to “not billed”.`,
				action: "Delete bill",
				destructive: true,
			}))
		) {
			return
		}
		try {
			await api.deleteWorkInvoice(invoice.id)
			toast.success("Bill deleted")
		} catch (error) {
			fail(error)
		}
	}

	const billMenuProps = {
		job,
		invoice,
		onPay,
		onBill,
		onRemove: owner ? () => void remove() : undefined,
	}

	return {
		money,
		showAll,
		setShowAll,
		payments,
		shown,
		readonly,
		owner,
		billMenuProps,
		removePayment,
	}
}
