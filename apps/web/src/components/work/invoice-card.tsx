import { WithContextMenu } from "@/components/layout/app-context-menu"
import { CopyIcon } from "@/components/icons/copy"
import { ExternalLinkIcon } from "@/components/icons/external-link"
import { Money } from "@/components/common/money"
import { Hint } from "@/components/common/hint"
import { MoreHorizontal } from "lucide-react"
import { accentStyle } from "@/components/goals/goal-meta"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type InvoiceStatus, type WorkInvoice, type WorkJob } from "@/lib/api"
import { formatShortDate } from "@/lib/format"
import { cn } from "cn"
import { formatHours, invoiceText } from "@/lib/work"
import type { JobActions } from "@/components/work/job-actions"
import { BillMenu } from "@/components/work/bill-menu"
import { copyForChat } from "@/components/work/copy-toast"
import { InvoiceCardPayments } from "@/components/work/invoice-card-payments"
import { useInvoiceCard } from "@/components/work/use-invoice-card"

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
	const card = useInvoiceCard({ job, invoice, onBill, onPay })
	const status = STATUS[invoice.status]

	const contextMenu = (
		<>
			<DropdownMenuItem
				onClick={() =>
					void copyForChat(invoiceText(invoice, job.currency), "Bill")
				}
			>
				<CopyIcon size={24} className="flex" /> Copy as a message
			</DropdownMenuItem>
			{!card.readonly && (
				<>
					<DropdownMenuSeparator />
					<BillMenu {...card.billMenuProps} />
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
							<CopyIcon size={24} className="flex" />
						</Button>
					</Hint>
					{!card.readonly && (
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
								<BillMenu {...card.billMenuProps} />
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
										<ExternalLinkIcon
											size={12}
											className="flex"
										/>{" "}
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

					<InvoiceCardPayments job={job} card={card} />
				</div>
			</div>
		</WithContextMenu>
	)
}
