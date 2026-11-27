import { WithContextMenu } from "@/components/layout/app-context-menu"
import { Money } from "@/components/common/money"
import { Briefcase, MoreHorizontal } from "lucide-react"
import { tintStyle } from "@/components/goals/goal-meta"
import { ShareBadge } from "@/components/sharing/share-bits"
import { payEveryLabel } from "@/lib/work"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { WorkJob } from "@/lib/api"
import type { JobActions } from "@/components/work/job-actions"
import { JobMenu } from "@/components/work/job-menu"
import { JobSectionBody } from "@/components/work/job-section-body"

/** React/UI entry: `JobSection`. */
export function JobSection({ job, ...actions }: { job: WorkJob } & JobActions) {
	const owner = job.access === "owner"
	const readonly = job.access === "view"
	const menuProps = { job, readonly, owner, actions }

	return (
		<WithContextMenu menu={<JobMenu {...menuProps} />}>
			<Card className="@container min-w-0 gap-0">
				<CardHeader className="flex items-start gap-3">
					<span
						className="grid size-10 shrink-0 place-items-center rounded-xl"
						style={tintStyle(job.color)}
					>
						<Briefcase className="size-5" />
					</span>
					<div className="min-w-0 flex-1">
						<CardTitle className="flex items-center gap-2">
							<span className="truncate">{job.name}</span>
							<ShareBadge
								item={job}
								onClick={() => actions.onShare(job)}
							/>
						</CardTitle>
						<CardDescription className="truncate">
							<Money value={job.rate} currency={job.currency} />
							/hr
							{job.payAmount && job.payEveryDays ? (
								<>
									{" · paid "}
									<Money
										value={job.payAmount}
										currency={job.currency}
									/>{" "}
									{payEveryLabel(job.payEveryDays)}
								</>
							) : null}
						</CardDescription>
					</div>
					{!readonly && (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label={`${job.name} options`}
									/>
								}
							>
								<MoreHorizontal />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<JobMenu {...menuProps} />
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</CardHeader>

				<CardContent className="grid gap-5 pt-4">
					<JobSectionBody job={job} {...actions} />
				</CardContent>
			</Card>
		</WithContextMenu>
	)
}
