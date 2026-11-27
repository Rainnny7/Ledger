import { confirmDialog } from "@/lib/confirm"
import { FileText } from "lucide-react"
import { NewInvoiceLink } from "@/components/invoices/new-invoice-link"
import { PaymentMethodsSection } from "@/components/invoices/payment-methods-section"
import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { notifyFailure } from "@/components/invoices/notify"
import { invoiceState } from "@/components/invoices/invoice-state"
import { PaymentMethodDialog } from "@/components/invoices/payment-method-dialog"
import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog"
import { ShareDialog } from "@/components/invoices/share-dialog"
import { InvoiceRow } from "@/components/invoices/invoice-row"
import { InvoiceStat } from "@/components/invoices/invoice-stat"
import {
	INVOICE_FILTERS,
	type InvoiceFilter,
} from "@/components/invoices/invoices-filters"
import { sumByCurrency } from "@/components/invoices/sum-by-currency"
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Bones } from "@/components/common/bones"
import { QueryError } from "@/components/ui/query-error"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, type Invoice, type PaymentMethod } from "@/lib/api"
import { isoDate } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { useInvoices } from "@/lib/queries"

async function removeMethod(m: PaymentMethod) {
	if (
		!(await confirmDialog({
			title: `Remove ${m.label}?`,
			description: "Invoices that offered it stop showing it.",
			action: "Remove",
			destructive: true,
		}))
	) {
		return
	}
	try {
		await api.deletePaymentMethod(m.id)
		toast.success(`${m.label} removed`)
	} catch (error) {
		notifyFailure(error)
	}
}

/** Sent invoices: status, filters, PDF links, and record payments. */
export function InvoicesPage() {
	const { data, loading, error, reload } = useInvoices()
	const navigate = useNavigate()
	const [filter, setFilter] = useState<InvoiceFilter>("all")
	const [sharing, setSharing] = useState<Invoice | null>(null)
	const [paying, setPaying] = useState<Invoice | null>(null)
	const [methodDialog, setMethodDialog] = useState<{
		method: PaymentMethod | null
	} | null>(null)

	const invoices = useMemo(() => data?.invoices ?? [], [data])
	const methods = data?.methods ?? []
	const withState = invoices.map((inv) => ({ inv, state: invoiceState(inv) }))
	const { match } =
		INVOICE_FILTERS.find((entry) => entry.value === filter) ??
		INVOICE_FILTERS[0]!
	const shown = withState.filter((item) => match(item.state))

	const open = withState
		.filter((item) => INVOICE_FILTERS[1]!.match(item.state))
		.map((item) => item.inv)
	const overdue = withState
		.filter((item) => item.state === "overdue")
		.map((item) => item.inv)
	const now = useNow()
	const month = isoDate(now).slice(0, 7)
	const paidThisMonth = invoices.filter((i) =>
		i.payments.some((payment) => payment.date.startsWith(month))
	)

	const live = (inv: Invoice | null) =>
		inv ? (invoices.find((i) => i.id === inv.id) ?? inv) : null

	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Invoices
					</h1>
					<p className="text-sm text-muted-foreground">
						Make an invoice in a minute, send the link or PDF, and
						see when it’s paid.
					</p>
				</div>
				<NewInvoiceLink>New Invoice</NewInvoiceLink>
			</div>

			{error && !data && (
				<QueryError
					message={error.message}
					onRetry={() => void reload()}
				/>
			)}

			<Bones
				name="invoices"
				className="grid gap-8"
				loading={!data && loading}
				fallback={
					<div className="grid gap-4">
						<div className="grid gap-4 sm:grid-cols-3">
							{[0, 1, 2].map((i) => (
								<Skeleton key={i} className="h-24 rounded-xl" />
							))}
						</div>
						<Skeleton className="h-72 rounded-xl" />
					</div>
				}
			>
				{data && (
					<>
						<div className="grid gap-4 sm:grid-cols-3">
							<InvoiceStat
								label="Outstanding"
								value={sumByCurrency(open, (i) => i.balance)}
								hint={`${open.length} invoice${open.length === 1 ? "" : "s"} waiting`}
							/>
							<InvoiceStat
								label="Overdue"
								value={sumByCurrency(overdue, (i) => i.balance)}
								hint={
									overdue.length
										? `${overdue.length} past the due date`
										: "Nothing late"
								}
								tone={overdue.length ? "bad" : undefined}
							/>
							<InvoiceStat
								label="Paid This Month"
								value={sumByCurrency(paidThisMonth, (i) =>
									i.payments
										.filter((payment) =>
											payment.date.startsWith(month)
										)
										.reduce(
											(sum, payment) =>
												sum + payment.amount,
											0
										)
								)}
								hint={`${paidThisMonth.length} invoice${paidThisMonth.length === 1 ? "" : "s"}`}
							/>
						</div>

						<Card>
							<CardHeader>
								<CardTitle>Your Invoices</CardTitle>
								<CardAction>
									<ToggleGroup
										value={[filter]}
										onValueChange={(value) =>
											value[0] &&
											setFilter(value[0] as InvoiceFilter)
										}
										variant="outline"
										size="sm"
									>
										{INVOICE_FILTERS.map((option) => (
											<ToggleGroupItem
												key={option.value}
												value={option.value}
											>
												{option.label}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
								</CardAction>
							</CardHeader>
							<CardContent className="grid gap-2">
								{invoices.length === 0 ? (
									<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
										<FileText className="size-8 text-muted-foreground" />
										<div>
											<p className="font-medium">
												No invoices yet
											</p>
											<p className="text-sm text-muted-foreground">
												Your details and payment methods
												are remembered, so every invoice
												after the first is quicker.
											</p>
										</div>
										<NewInvoiceLink>
											Create your first invoice
										</NewInvoiceLink>
									</div>
								) : shown.length === 0 ? (
									<p className="py-8 text-center text-sm text-muted-foreground">
										Nothing here.
									</p>
								) : (
									shown.map(({ inv, state }) => (
										<InvoiceRow
											key={inv.id}
											invoice={inv}
											state={state}
											methods={methods}
											onOpen={() =>
												navigate({
													href: `/invoices/${inv.id}`,
												})
											}
											onShare={() => setSharing(inv)}
											onPay={() => setPaying(inv)}
											onDuplicate={() =>
												navigate({
													href: `/invoices/new?copy=${inv.id}`,
												})
											}
										/>
									))
								)}
							</CardContent>
						</Card>

						<PaymentMethodsSection
							methods={methods}
							onAdd={() => setMethodDialog({ method: null })}
							onEdit={(method) => setMethodDialog({ method })}
							onRemove={(method) => void removeMethod(method)}
						/>
					</>
				)}
			</Bones>

			<ShareDialog
				invoice={live(sharing)}
				methods={methods}
				onClose={() => setSharing(null)}
			/>
			<RecordPaymentDialog
				invoice={live(paying)}
				methods={methods}
				onClose={() => setPaying(null)}
			/>
			<PaymentMethodDialog
				open={!!methodDialog}
				method={methodDialog?.method ?? null}
				paypal={data?.paypal ?? []}
				onClose={() => setMethodDialog(null)}
			/>
		</div>
	)
}
