import { CheckCircle2 } from "lucide-react"
import type { ReactNode } from "react"
import type { PublicInvoice } from "@/lib/api"
import { daysFromToday, formatDate } from "@/lib/format"
import { invoiceMoney } from "@/lib/invoice"
import { cn } from "cn"

function amountHeadline(invoice: PublicInvoice): string {
	const paid = invoice.payState === "paid"
	const isVoid = invoice.status === "void"
	if (paid) {
		return "Paid in full"
	}
	if (isVoid) {
		return "Cancelled"
	}
	if (invoice.paid > 0) {
		return "Balance due"
	}
	return "Amount due"
}

function amountSubline(invoice: PublicInvoice): ReactNode {
	const paid = invoice.payState === "paid"
	const isVoid = invoice.status === "void"
	const overdue =
		!paid &&
		!isVoid &&
		invoice.dueDate &&
		daysFromToday(invoice.dueDate) < 0

	if (paid) {
		return (
			<span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
				<CheckCircle2 className="size-4" /> Thank you, this invoice is
				paid.
			</span>
		)
	}
	if (isVoid) {
		return "This invoice was cancelled. Nothing is owed."
	}
	if (invoice.dueDate) {
		return `${overdue ? "Was due" : "Due"} ${formatDate(invoice.dueDate)}`
	}
	return "Due on receipt"
}

function amountDueClass(invoice: PublicInvoice): string {
	const paid = invoice.payState === "paid"
	const isVoid = invoice.status === "void"
	const overdue =
		!paid &&
		!isVoid &&
		invoice.dueDate &&
		daysFromToday(invoice.dueDate) < 0
	if (overdue) {
		return "font-medium text-red-600 dark:text-red-400"
	}
	return "text-muted-foreground"
}

/** Amount due line and status text on the public invoice summary card. */
export function PublicInvoiceViewAmount({
	invoice,
}: {
	invoice: PublicInvoice
}) {
	const money = (amount: number) => invoiceMoney(amount, invoice.currency)
	const paid = invoice.payState === "paid"
	const isVoid = invoice.status === "void"

	return (
		<div className="grid gap-1">
			<p className="text-sm text-muted-foreground">
				{amountHeadline(invoice)}
			</p>
			<p
				className={cn(
					"text-4xl font-semibold tracking-tight tabular-nums",
					(paid || isVoid) && "text-muted-foreground"
				)}
			>
				{money(paid ? invoice.total : invoice.balance)}
			</p>
			<p className={cn("text-sm", amountDueClass(invoice))}>
				{amountSubline(invoice)}
			</p>
		</div>
	)
}
