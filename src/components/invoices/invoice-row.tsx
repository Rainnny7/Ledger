import { WithContextMenu } from "@/components/layout/app-context-menu"
import { confirmDialog } from "@/lib/confirm"
import { ForeignMoney } from "@/components/common/money"
import { Hint } from "@/components/common/hint"
import {
	Ban,
	CopyPlus,
	Download,
	HandCoins,
	Loader2,
	MoreHorizontal,
	Pencil,
	RotateCcw,
	Send,
	Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { notifyFailure } from "@/components/invoices/notify"
import {
	dueLabel,
	rowAmount,
	type InvoiceState,
} from "@/components/invoices/invoice-state"
import { pdfFileName, pdfSource } from "@/components/invoices/pdf-files"
import { StateBadge } from "@/components/invoices/state-badge"
import { usePdfDownload } from "@/components/invoices/use-pdf-download"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api, type Invoice, type PaymentMethod } from "@/lib/api"
import { demoMode } from "@/lib/demo"
import { invoiceMoney } from "@/lib/invoice"

const readOnly = () =>
	toast.error("Demo mode is read-only. Exit demo mode to make changes.")

/** React/UI entry: `InvoiceRow`. */
export function InvoiceRow({
	invoice,
	state,
	methods,
	onOpen,
	onShare,
	onPay,
	onDuplicate,
}: {
	invoice: Invoice
	state: InvoiceState
	methods: PaymentMethod[]
	onOpen: () => void
	onShare: () => void
	onPay: () => void
	onDuplicate: () => void
}) {
	const downloadPdf = usePdfDownload()
	const money = (amount: number) => invoiceMoney(amount, invoice.currency)
	const amount = rowAmount(invoice, state)

	async function setStatus(status: Invoice["status"], done: string) {
		if (demoMode) {
			return readOnly()
		}
		try {
			await api.updateInvoice(invoice.id, { status })
			toast.success(done)
		} catch (error) {
			notifyFailure(error)
		}
	}

	async function remove() {
		if (demoMode) {
			return readOnly()
		}
		if (
			!(await confirmDialog({
				title: `Delete invoice ${invoice.number}?`,
				description: "Its link stops working. This can’t be undone.",
				action: "Delete invoice",
				destructive: true,
			}))
		) {
			return
		}
		try {
			await api.deleteInvoice(invoice.id)
			toast.success(`${invoice.number} deleted`)
		} catch (error) {
			notifyFailure(error)
		}
	}

	const menuProps = {
		state,
		onShare,
		onDownload: () =>
			downloadPdf.mutate({
				source: pdfSource(invoice, methods),
				name: pdfFileName(invoice),
			}),
		onPay,
		onOpen,
		onDuplicate,
		onRestore: () => void setStatus("sent", `${invoice.number} restored`),
		onVoid: () => void setStatus("void", `${invoice.number} voided`),
		onRemove: () => void remove(),
	}

	return (
		<WithContextMenu menu={<InvoiceRowMenu {...menuProps} />}>
			<div className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
				<button
					type="button"
					onClick={onOpen}
					className="grid min-w-0 flex-1 gap-0.5 text-left"
				>
					<span className="flex min-w-0 items-center gap-2">
						<span className="truncate text-sm font-medium">
							{invoice.client.name || "No client yet"}
						</span>
						<StateBadge state={state} />
					</span>
					<span className="truncate text-xs text-muted-foreground">
						{invoice.number} · {dueLabel(invoice, state)}
					</span>
				</button>
				<div className="text-right">
					<p className="text-sm font-semibold tabular-nums">
						<ForeignMoney
							value={amount}
							currency={invoice.currency}
						>
							{money(amount)}
						</ForeignMoney>
					</p>
					{invoice.paid > 0 && invoice.balance > 0 && (
						<p className="text-xs text-muted-foreground tabular-nums">
							of{" "}
							<ForeignMoney
								value={invoice.total}
								currency={invoice.currency}
							>
								{money(invoice.total)}
							</ForeignMoney>
						</p>
					)}
				</div>
				<Hint label="Send">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Send ${invoice.number}`}
						onClick={onShare}
						className="max-sm:hidden"
					>
						<Send />
					</Button>
				</Hint>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`${invoice.number} options`}
							/>
						}
					>
						{downloadPdf.isPending ? (
							<Loader2 className="animate-spin" />
						) : (
							<MoreHorizontal />
						)}
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<InvoiceRowMenu {...menuProps} />
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</WithContextMenu>
	)
}

function InvoiceRowMenu({
	state,
	onShare,
	onDownload,
	onPay,
	onOpen,
	onDuplicate,
	onRestore,
	onVoid,
	onRemove,
}: {
	state: InvoiceState
	onShare: () => void
	onDownload: () => void
	onPay: () => void
	onOpen: () => void
	onDuplicate: () => void
	onRestore: () => void
	onVoid: () => void
	onRemove: () => void
}) {
	return (
		<>
			<DropdownMenuItem onClick={onShare}>
				<Send /> Send / share
			</DropdownMenuItem>
			<DropdownMenuItem onClick={onDownload}>
				<Download /> Download PDF
			</DropdownMenuItem>
			{state !== "paid" && state !== "void" && (
				<DropdownMenuItem onClick={onPay}>
					<HandCoins /> Record payment
				</DropdownMenuItem>
			)}
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={onOpen}>
				<Pencil /> Edit
			</DropdownMenuItem>
			<DropdownMenuItem onClick={onDuplicate}>
				<CopyPlus /> Duplicate
			</DropdownMenuItem>
			{state === "void" ? (
				<DropdownMenuItem onClick={onRestore}>
					<RotateCcw /> Restore
				</DropdownMenuItem>
			) : (
				state !== "paid" && (
					<DropdownMenuItem onClick={onVoid}>
						<Ban /> Void
					</DropdownMenuItem>
				)
			)}
			<DropdownMenuItem variant="destructive" onClick={onRemove}>
				<Trash2 /> Delete
			</DropdownMenuItem>
		</>
	)
}
