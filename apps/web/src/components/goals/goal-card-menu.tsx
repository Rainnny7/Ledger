import {
	Archive,
	ArchiveRestore,
	LogOut,
	Pencil,
	Plus,
	Share2,
	Trash2,
} from "lucide-react"
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
						<Plus />{" "}
						{g.kind === "payoff" ? "Log a payment" : "Add money"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
				</>
			)}
			{opts.canEdit && (
				<DropdownMenuItem onClick={() => onEdit(g)}>
					<Pencil /> Edit
				</DropdownMenuItem>
			)}
			{opts.owner ? (
				<>
					<DropdownMenuItem onClick={() => onShare(g)}>
						<Share2 /> Share
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
						<Trash2 /> Delete
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
