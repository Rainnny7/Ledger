import { CopyIcon } from "@/components/icons/copy"
import { Hint } from "@/components/common/hint"
import { Money } from "@/components/common/money"
import { copyForChat } from "@/components/work/copy-toast"
import type { useInvoiceCard } from "@/components/work/use-invoice-card"
import { formatMoney, formatShortDate } from "@/lib/format"
import { paymentLine } from "@/lib/work"
import type { WorkJob } from "@/lib/api"
import { Link2, X } from "lucide-react"

type CardState = ReturnType<typeof useInvoiceCard>

/** Payment list and expand control on an invoice card. */
export function InvoiceCardPayments({
	job,
	card,
}: {
	job: WorkJob
	card: CardState
}) {
	if (card.payments.length === 0) {
		return null
	}

	return (
		<div className="grid min-w-0 content-start gap-1">
			<ul className="grid text-sm">
				{card.shown.map((payment) => (
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
						{payment.receivedAmount && payment.receivedCurrency && (
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
										value={payment.remainingAfter}
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
										paymentLine(payment, job.currency),
										"Update"
									)
								}
							>
								<CopyIcon size={14} className="flex" />
							</button>
						</Hint>
						{card.owner && (
							<button
								type="button"
								aria-label="Remove payment"
								className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
								onClick={() =>
									void card.removePayment(payment.id)
								}
							>
								<X className="size-3.5" />
							</button>
						)}
					</li>
				))}
			</ul>
			{card.payments.length > 4 && (
				<button
					type="button"
					className="w-fit text-xs font-medium text-primary hover:underline"
					onClick={() => card.setShowAll((expanded) => !expanded)}
				>
					{card.showAll
						? "Show less"
						: `Show all ${card.payments.length}`}
				</button>
			)}
		</div>
	)
}
