import { Archive, ArchiveRestore, LogOut } from "lucide-react"
import { Trash2Icon } from "@/components/icons/trash-2"
import { PencilIcon } from "@/components/icons/pencil"
import { Share2Icon } from "@/components/icons/share-2"
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
				<PencilIcon size={24} className="flex" /> Edit job
			</DropdownMenuItem>
			{owner ? (
				<>
					<DropdownMenuItem onClick={() => actions.onShare(job)}>
						<Share2Icon size={24} className="flex" /> Share
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
						<Trash2Icon size={24} className="flex" /> Delete
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
