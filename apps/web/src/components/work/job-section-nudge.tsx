import type { ReactNode } from "react"
import { Money } from "@/components/common/money"
import type { WorkJob } from "@/lib/api"
import {
	formatDate,
	formatRelativeDate,
	formatShortDate,
	isoDate,
} from "@/lib/format"
import { formatDuration } from "@/lib/work"

/** Subtitle under the owed amount on a job card. */
export function jobSectionNudge(job: WorkJob): ReactNode {
	if (job.owed <= 0) {
		return job.unbilledHours > 0
			? `${formatDuration(job.unbilledHours)} ready to bill`
			: "All paid up"
	}
	if (job.payoffDate && job.paymentsLeft) {
		const next =
			job.nextPaymentDate === isoDate()
				? "next one due today"
				: `next ${formatShortDate(job.nextPaymentDate!)}`
		return `${job.paymentsLeft} more payment${job.paymentsLeft === 1 ? "" : "s"} · ${next} · cleared by ${formatDate(job.payoffDate)}`
	}
	return job.lastPaymentDate ? (
		`Last paid ${formatRelativeDate(job.lastPaymentDate)}`
	) : (
		<>
			Billed <Money value={job.billedTotal} currency={job.currency} /> so
			far
		</>
	)
}
