import { Trash2Icon } from "@/components/icons/trash-2"
import { PencilIcon } from "@/components/icons/pencil"
import { Share2Icon } from "@/components/icons/share-2"
import { LogOut, Pause, Play } from "lucide-react"
import { leaveShared } from "@/lib/sharing"
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { Subscription } from "@/lib/api"

/** Context and overflow menu items for one subscription row. */
export function SubscriptionTableRowMenu({
	subscription,
	onEdit,
	onShare,
	onToggle,
	onRemove,
}: {
	subscription: Subscription
	onEdit: (subscription: Subscription) => void
	onShare: (subscription: Subscription) => void
	onToggle: (subscription: Subscription) => void
	onRemove: (subscription: Subscription) => void
}) {
	return (
		<>
			{subscription.access !== "view" && (
				<>
					<DropdownMenuItem onClick={() => onEdit(subscription)}>
						<PencilIcon size={24} className="flex" /> Edit
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => void onToggle(subscription)}
					>
						{subscription.active ? <Pause /> : <Play />}{" "}
						{subscription.active ? "Pause" : "Resume"}
					</DropdownMenuItem>
				</>
			)}
			{subscription.access === "owner" ? (
				<>
					<DropdownMenuItem onClick={() => onShare(subscription)}>
						<Share2Icon size={24} className="flex" /> Share
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onClick={() => void onRemove(subscription)}
					>
						<Trash2Icon size={24} className="flex" /> Delete
					</DropdownMenuItem>
				</>
			) : (
				<DropdownMenuItem
					variant="destructive"
					onClick={() =>
						void leaveShared("subscription", subscription)
					}
				>
					<LogOut /> Remove from my list
				</DropdownMenuItem>
			)}
		</>
	)
}
