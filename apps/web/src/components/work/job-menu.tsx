import {
	Archive,
	ArchiveRestore,
	LogOut,
	Pencil,
	Share2,
	Trash2,
} from "lucide-react"
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { WorkJob } from "@/lib/api"
import type { JobActions } from "@/components/work/job-actions"

/** React/UI entry: `JobMenu`. */
export function JobMenu({
	job,
	readonly,
	owner,
	actions,
}: {
	job: WorkJob
	readonly: boolean
	owner: boolean
	actions: JobActions
}) {
	if (readonly) {
		return null
	}
	return (
		<>
			<DropdownMenuItem onClick={() => actions.onEdit(job)}>
				<Pencil /> Edit job
			</DropdownMenuItem>
			{owner ? (
				<>
					<DropdownMenuItem onClick={() => actions.onShare(job)}>
						<Share2 /> Share
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => actions.onArchive(job)}>
						{job.archived ? <ArchiveRestore /> : <Archive />}{" "}
						{job.archived ? "Restore" : "Archive"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onClick={() => actions.onDelete(job)}
					>
						<Trash2 /> Delete
					</DropdownMenuItem>
				</>
			) : (
				<DropdownMenuItem
					variant="destructive"
					onClick={() => actions.onLeave(job)}
				>
					<LogOut /> Remove from my jobs
				</DropdownMenuItem>
			)}
		</>
	)
}
