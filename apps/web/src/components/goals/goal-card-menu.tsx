import { Archive, ArchiveRestore, LogOut } from "lucide-react"
import { PlusIcon } from "@/components/icons/plus"
import { Trash2Icon } from "@/components/icons/trash-2"
import { PencilIcon } from "@/components/icons/pencil"
import { Share2Icon } from "@/components/icons/share-2"
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { Goal } from "@/lib/api"

/** Goal Card Actions. */
export type GoalCardActions = {
	onPay: (goal: Goal) => void
	onEdit: (goal: Goal) => void
	onDelete: (goal: Goal) => void
	onArchive: (goal: Goal) => void
	onShare: (goal: Goal) => void
	onLeave: (goal: Goal) => void
}

/** goalCardMenuItems. */
export function goalCardMenuItems(
	g: Goal,
	actions: GoalCardActions,
	opts: { done: boolean; canEdit: boolean; owner: boolean }
) {
	const { onPay, onEdit, onDelete, onArchive, onShare, onLeave } = actions
	return (
		<>
			{!opts.done && !g.archived && opts.canEdit && (
				<>
					<DropdownMenuItem onClick={() => onPay(g)}>
						<PlusIcon size={24} className="flex" />{" "}
						{g.kind === "payoff" ? "Log a payment" : "Add money"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
				</>
			)}
			{opts.canEdit && (
				<DropdownMenuItem onClick={() => onEdit(g)}>
					<PencilIcon size={24} className="flex" /> Edit
				</DropdownMenuItem>
			)}
			{opts.owner ? (
				<>
					<DropdownMenuItem onClick={() => onShare(g)}>
						<Share2Icon size={24} className="flex" /> Share
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => onArchive(g)}>
						{g.archived ? <ArchiveRestore /> : <Archive />}{" "}
						{g.archived ? "Restore" : "Archive"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onClick={() => onDelete(g)}
					>
						<Trash2Icon size={24} className="flex" /> Delete
					</DropdownMenuItem>
				</>
			) : (
				<DropdownMenuItem
					variant="destructive"
					onClick={() => onLeave(g)}
				>
					<LogOut /> Remove from my goals
				</DropdownMenuItem>
			)}
		</>
	)
}
