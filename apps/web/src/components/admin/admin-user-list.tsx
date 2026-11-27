import { AdminUserRow } from "@/components/admin/admin-user-row"
import { AdminUserMenuItems } from "@/components/admin/user-menu"
import type { AdminUser, UserDialog } from "@/components/admin/admin-types"
import { authClient } from "@/lib/auth-client"

/** Scrollable list of users on the admin Users card. */
export function AdminUserList({
	users,
	sessionUserId,
	ownerId,
	iAmOwner,
	busy,
	onDialog,
	onAct,
}: {
	users: AdminUser[]
	sessionUserId: string | undefined
	ownerId: string | null
	iAmOwner: boolean
	busy: string | null
	onDialog: (dialog: UserDialog) => void
	onAct: (
		user: AdminUser,
		label: string,
		run: () => Promise<{ error: { message?: string } | null }>
	) => Promise<void>
}) {
	return (
		<>
			{users.map((user, index) => {
				const isMe = user.id === sessionUserId
				const isAdmin = user.role === "admin"
				const isOwner = user.id === ownerId
				const manageable = !isMe && (!isOwner || iAmOwner)
				const busyUser = busy === user.id
				const menuItems = manageable ? (
					<AdminUserMenuItems
						user={user}
						iAmOwner={iAmOwner}
						isAdmin={isAdmin}
						disabled={busyUser}
						onRole={() => onDialog({ type: "role", user })}
						onPassword={() => onDialog({ type: "password", user })}
						onRevokeSessions={() =>
							void onAct(user, "Logged out everywhere", () =>
								authClient.admin.revokeUserSessions({
									userId: user.id,
								})
							)
						}
						onUnban={() =>
							void onAct(user, "Access restored", () =>
								authClient.admin.unbanUser({
									userId: user.id,
								})
							)
						}
						onBan={() => onDialog({ type: "ban", user })}
						onDelete={() => onDialog({ type: "delete", user })}
					/>
				) : null
				return (
					<AdminUserRow
						key={user.id}
						user={user}
						index={index}
						isMe={isMe}
						isAdmin={isAdmin}
						isOwner={isOwner}
						manageable={manageable}
						busyUser={busyUser}
						menuItems={menuItems}
					/>
				)
			})}
		</>
	)
}
