import { WithContextMenu } from "@/components/layout/app-context-menu"
import { confirmDialog } from "@/lib/confirm"
import { Money } from "@/components/common/money"
import { Hint } from "@/components/common/hint"
import { Copy, ExternalLink, Link2, MoreHorizontal, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { accentStyle } from "@/components/goals/goal-meta"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	api,
	type InvoiceStatus,
	type WorkInvoice,
	type WorkJob,
} from "@/lib/api"
import { demoMode } from "@/lib/demo"
import { formatMoney, formatShortDate } from "@/lib/format"
import { cn } from "cn"
import { formatHours, invoiceText, paymentLine } from "@/lib/work"
import type { JobActions } from "@/components/work/job-actions"
import { BillMenu } from "@/components/work/bill-menu"
import { copyForChat } from "@/components/work/copy-toast"

const fail = (error: unknown) => toast.error((error as Error).message)
const readOnly = () =>
	toast.error("Demo mode is read-only. Exit demo mode to make changes.")

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

const STATUS: Record<InvoiceStatus, { label: string; className: string }> = {
	unpaid: {
		label: "Unpaid",
		className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	},
	partial: {
		label: "Paying off",
		className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
	},
	paid: {
		label: "Paid",
		className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	},
}

/** React/UI entry: `InvoiceCard`. */
export function InvoiceCard({
	job,
	invoice,
	onBill,
	onPay,
}: { job: WorkJob; invoice: WorkInvoice } & JobActions) {
	const money = (amount: number) => formatMoney(amount, job.currency)
	const status = STATUS[invoice.status]
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

	const contextMenu = (
		<>
			<DropdownMenuItem
				onClick={() =>
					void copyForChat(invoiceText(invoice, job.currency), "Bill")
				}
			>
				<Copy /> Copy as a message
			</DropdownMenuItem>
			{!readonly && (
				<>
					<DropdownMenuSeparator />
					<BillMenu {...billMenuProps} />
				</>
			)}
		</>
	)

	return (
		<WithContextMenu menu={contextMenu}>
			<div className="@container/bill grid min-w-0 gap-3 rounded-xl border p-4">
				<div className="flex items-start gap-2">
					<div className="min-w-0 flex-1">
						<p className="flex items-center gap-2 text-sm font-medium">
							Billed {formatShortDate(invoice.date)}
							<span
								className={cn(
									"rounded-full px-2 py-0.5 text-[11px] font-medium",
									status.className
								)}
							>
								{status.label}
							</span>
						</p>
						<p className="text-xs text-muted-foreground tabular-nums">
							{formatHours(invoice.hours)} hrs ×{" "}
							<Money
								value={invoice.rate}
								currency={job.currency}
							/>
							{Math.abs(
								invoice.total -
									Math.round(
										invoice.hours * invoice.rate * 100
									) /
										100
							) > 0.005 && " (agreed total)"}
							{invoice.counterHours !== null &&
								` · tracker at ${formatHours(invoice.counterHours)}`}
						</p>
					</div>
					<Hint label="Copy as a message">
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Copy for chat"
							onClick={() =>
								void copyForChat(
									invoiceText(invoice, job.currency),
									"Bill"
								)
							}
						>
							<Copy />
						</Button>
					</Hint>
					{!readonly && (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label="Bill options"
									/>
								}
							>
								<MoreHorizontal />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<BillMenu {...billMenuProps} />
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>

				<div className="grid min-w-0 gap-3 @xl/bill:grid-cols-2 @xl/bill:gap-x-6">
					<div className="grid min-w-0 content-start gap-3">
						<div className="grid gap-1.5">
							<div className="flex flex-wrap items-baseline justify-between gap-x-2 tabular-nums">
								<span className="text-xl font-semibold">
									<Money
										value={
											invoice.status === "paid"
												? invoice.total
												: invoice.remaining
										}
										currency={job.currency}
									/>
								</span>
								<span className="text-xs text-muted-foreground">
									{invoice.status === "paid" ? (
										`paid ${invoice.paidAt ? formatShortDate(invoice.paidAt) : ""}`
									) : (
										<>
											left of{" "}
											<Money
												value={invoice.total}
												currency={job.currency}
											/>
										</>
									)}
								</span>
							</div>
							<div className="h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full transition-[width] duration-500"
									style={{
										width: `${Math.round(invoice.progress * 100)}%`,
										...accentStyle(job.color),
									}}
								/>
							</div>
							{invoice.overpaid > 0 && (
								<p className="text-xs text-amber-600 dark:text-amber-400">
									Overpaid by{" "}
									<Money
										value={invoice.overpaid}
										currency={job.currency}
									/>
								</p>
							)}
						</div>

						{(invoice.proofUrl || invoice.note) && (
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
								{invoice.proofUrl && (
									<a
										href={invoice.proofUrl}
										target="_blank"
										rel="noopener noreferrer nofollow"
										className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
									>
										<ExternalLink className="size-3" />{" "}
										Proof
									</a>
								)}
								{invoice.note && (
									<span className="min-w-0 break-words whitespace-pre-line">
										{invoice.note}
									</span>
								)}
							</div>
						)}
					</div>

					{payments.length > 0 && (
						<div className="grid min-w-0 content-start gap-1">
							<ul className="grid text-sm">
								{shown.map((payment) => (
									<li
										key={payment.id}
										className="group flex items-center gap-2 rounded-md px-2 py-1 odd:bg-muted/40"
									>
										<span className="w-14 shrink-0 text-muted-foreground tabular-nums">
											{formatShortDate(payment.date)}
										</span>
										<span className="shrink-0 text-emerald-600 tabular-nums dark:text-emerald-400">
											+
											<Money
												value={payment.amount}
												currency={job.currency}
											/>
										</span>
										{payment.receivedAmount &&
											payment.receivedCurrency && (
												<Hint
													label={`Landed as ${formatMoney(payment.receivedAmount, payment.receivedCurrency)} ${payment.receivedCurrency} · 1 ${job.currency} = ${(payment.receivedAmount / payment.amount).toFixed(4)} ${payment.receivedCurrency}`}
												>
													<span className="shrink-0 cursor-default text-xs text-muted-foreground tabular-nums">
														→{" "}
														{formatMoney(
															payment.receivedAmount,
															payment.receivedCurrency
														)}
													</span>
												</Hint>
											)}
										<span className="flex min-w-0 flex-1 items-center justify-end gap-1 truncate text-xs text-muted-foreground tabular-nums">
											{payment.transactionId && (
												<Link2
													className="size-3 shrink-0"
													aria-label="Linked to a transaction"
												/>
											)}
											{payment.remainingAfter > 0 ? (
												<>
													<Money
														value={
															payment.remainingAfter
														}
														currency={job.currency}
													/>{" "}
													left
												</>
											) : (
												"cleared"
											)}
										</span>
										<Hint
											label={`Copy: ${paymentLine(payment, job.currency)}`}
										>
											<button
												type="button"
												aria-label="Copy update"
												className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
												onClick={() =>
													void copyForChat(
														paymentLine(
															payment,
															job.currency
														),
														"Update"
													)
												}
											>
												<Copy className="size-3.5" />
											</button>
										</Hint>
										{owner && (
											<button
												type="button"
												aria-label="Remove payment"
												className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
												onClick={() =>
													void removePayment(
														payment.id
													)
												}
											>
												<X className="size-3.5" />
											</button>
										)}
									</li>
								))}
							</ul>
							{payments.length > 4 && (
								<button
									type="button"
									className="w-fit text-xs font-medium text-primary hover:underline"
									onClick={() =>
										setShowAll((expanded) => !expanded)
									}
								>
									{showAll
										? "Show less"
										: `Show all ${payments.length}`}
								</button>
							)}
						</div>
					)}
				</div>
			</div>
		</WithContextMenu>
	)
}
