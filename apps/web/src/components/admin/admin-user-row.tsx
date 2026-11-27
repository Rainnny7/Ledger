import { userInitials, userJoined } from "@/components/admin/admin-user-utils"
import type { AdminUser } from "@/components/admin/admin-types"
import { WithContextMenu } from "@/components/layout/app-context-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Crown, Loader2, MoreHorizontal, ShieldCheck } from "lucide-react"
import type { ReactNode } from "react"

/** One row in the admin users list. */
export function AdminUserRow({
	user,
	index,
	isMe,
	isAdmin,
	isOwner,
	manageable,
	busyUser,
	menuItems,
}: {
	user: AdminUser
	index: number
	isMe: boolean
	isAdmin: boolean
	isOwner: boolean
	manageable: boolean
	busyUser: boolean
	menuItems: ReactNode
}) {
	return (
		<WithContextMenu menu={menuItems}>
			<div
				className="flex animate-in items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-300 fade-in-0 fill-mode-both hover:bg-muted/60"
				style={{
					animationDelay: `${Math.min(index, 10) * 30}ms`,
				}}
			>
				<Avatar className="size-8">
					<AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
						{userInitials(user)}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
						<span className="truncate">
							{user.name || user.email}
						</span>
						{isMe ? <Badge variant="outline">You</Badge> : null}
						{isOwner ? (
							<Badge>
								<Crown /> Owner
							</Badge>
						) : isAdmin ? (
							<Badge>Admin</Badge>
						) : null}
						{user.mustChangePassword ? (
							<Badge variant="outline">Temporary password</Badge>
						) : null}
						{user.banned ? (
							<Badge variant="destructive">Banned</Badge>
						) : null}
						{user.twoFactorEnabled ? (
							<Badge variant="secondary">
								<ShieldCheck /> 2FA
							</Badge>
						) : null}
					</div>
					<div className="truncate text-xs text-muted-foreground">
						{user.email} · joined{" "}
						{userJoined.format(new Date(user.createdAt))}
					</div>
				</div>
				{busyUser ? (
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
				) : null}
				{manageable ? (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon"
									aria-label={`Manage ${user.name || user.email}`}
									disabled={busyUser}
								/>
							}
						>
							<MoreHorizontal />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							{menuItems}
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</div>
		</WithContextMenu>
	)
}
