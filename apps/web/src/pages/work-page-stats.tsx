import { AnimatedMoney } from "@/components/common/count-up"
import { WorkStat } from "@/components/work/work-stat"
import type { useWorkPage } from "@/pages/use-work-page"
import {
	formatDate,
	formatMonth,
	formatRelativeDate,
	formatShortDate,
} from "@/lib/format"
import { formatDuration } from "@/lib/work"

type WorkPageState = ReturnType<typeof useWorkPage>

/** Summary stat row for active jobs on the work page. */
export function WorkPageStats({ page }: { page: WorkPageState }) {
	if (page.active.length === 0) {
		return null
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<WorkStat
				label="Owed to You"
				value={<AnimatedMoney value={page.owed} />}
				hint={
					page.payoff
						? `Cleared by ${formatDate(page.payoff)} at this pace`
						: page.owed > 0
							? "Across your open bills"
							: "All caught up"
				}
			/>
			<WorkStat
				label="Next Payment"
				value={
					page.next ? (
						<AnimatedMoney
							value={Math.min(
								page.next.payAmount ?? page.next.owed,
								page.next.owed
							)}
							currency={page.next.currency}
						/>
					) : (
						"—"
					)
				}
				hint={
					page.next
						? `${formatRelativeDate(page.next.nextPaymentDate!)} · ${formatShortDate(page.next.nextPaymentDate!)}`
						: "Nothing scheduled"
				}
			/>
			<WorkStat
				label="Not Billed Yet"
				value={<AnimatedMoney value={page.unbilledValue} />}
				hint={
					page.unbilledHours > 0
						? `${formatDuration(page.unbilledHours)} logged`
						: "No unbilled hours"
				}
			/>
			<WorkStat
				label="Paid This Month"
				value={<AnimatedMoney value={page.paidThisMonth} />}
				hint={
					page.monthPayments.length
						? `${page.monthPayments.length} payment${page.monthPayments.length === 1 ? "" : "s"} dated in ${formatMonth(page.month, "long")}`
						: "No payments yet"
				}
			/>
		</div>
	)
}
