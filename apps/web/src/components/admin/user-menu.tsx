import {
	Ban,
	KeyRound,
	LogOut,
	ShieldCheck,
	ShieldMinus,
	Trash2,
	UserCheck,
} from "lucide-react"
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { AdminUser } from "@/components/admin/admin-types"

/** Menu items for one user on the admin users list. */
export function AdminUserMenuItems({
	user,
	iAmOwner,
	isAdmin,
	disabled,
	onRole,
	onPassword,
	onRevokeSessions,
	onUnban,
	onBan,
	onDelete,
}: {
	user: AdminUser
	iAmOwner: boolean
	isAdmin: boolean
	disabled?: boolean
	onRole: () => void
	onPassword: () => void
	onRevokeSessions: () => void
	onUnban: () => void
	onBan: () => void
	onDelete: () => void
}) {
	return (
		<>
			{iAmOwner && (
				<DropdownMenuItem disabled={disabled} onClick={onRole}>
					{isAdmin ? <ShieldMinus /> : <ShieldCheck />}{" "}
					{isAdmin ? "Remove admin" : "Make admin"}
				</DropdownMenuItem>
			)}
			<DropdownMenuItem disabled={disabled} onClick={onPassword}>
				<KeyRound /> Set temporary password
			</DropdownMenuItem>
			<DropdownMenuItem disabled={disabled} onClick={onRevokeSessions}>
				<LogOut /> Logout everywhere
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			{user.banned ? (
				<DropdownMenuItem disabled={disabled} onClick={onUnban}>
					<UserCheck /> Restore access
				</DropdownMenuItem>
			) : (
				<DropdownMenuItem disabled={disabled} onClick={onBan}>
					<Ban /> Block sign-in
				</DropdownMenuItem>
			)}
			<DropdownMenuItem
				variant="destructive"
				disabled={disabled}
				onClick={onDelete}
			>
				<Trash2 /> Delete user
			</DropdownMenuItem>
		</>
	)
}