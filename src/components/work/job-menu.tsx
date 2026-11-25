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

export function JobMenu({
  job: j,
  readonly,
  owner,
  actions,
}: {
  job: WorkJob
  readonly: boolean
  owner: boolean
  actions: JobActions
}) {
  if (readonly) return null
  return (
    <>
      <DropdownMenuItem onClick={() => actions.onEdit(j)}>
        <Pencil /> Edit job
      </DropdownMenuItem>
      {owner ? (
        <>
          <DropdownMenuItem onClick={() => actions.onShare(j)}>
            <Share2 /> Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.onArchive(j)}>
            {j.archived ? <ArchiveRestore /> : <Archive />}{" "}
            {j.archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => actions.onDelete(j)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </>
      ) : (
        <DropdownMenuItem
          variant="destructive"
          onClick={() => actions.onLeave(j)}
        >
          <LogOut /> Remove from my jobs
        </DropdownMenuItem>
      )}
    </>
  )
}
