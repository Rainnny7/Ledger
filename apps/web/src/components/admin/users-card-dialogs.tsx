import {
	AddUserDialog,
	AdminUserConfirmDialog,
	SetPasswordDialog,
} from "@/components/admin/user-dialogs"
import type { UserDialog } from "@/components/admin/admin-types"
import { authClient } from "@/lib/auth-client"
import { toast } from "sonner"

/** Modal dialogs opened from the admin Users card. */
export function UsersCardDialogs({
	dialog,
	iAmOwner,
	onClose,
	onRefresh,
	onFlash,
}: {
	dialog: UserDialog | null
	iAmOwner: boolean
	onClose: () => void
	onRefresh: () => void
	onFlash: () => void
}) {
	return (
		<>
			<AddUserDialog
				open={dialog?.type === "add"}
				canAddAdmins={iAmOwner}
				onClose={onClose}
				onAdded={onRefresh}
			/>
			<SetPasswordDialog
				user={dialog?.type === "password" ? dialog.user : null}
				onClose={onClose}
				onDone={onRefresh}
			/>
			<AdminUserConfirmDialog
				user={dialog?.type === "role" ? dialog.user : null}
				onClose={onClose}
				destructive={
					dialog?.type === "role" && dialog.user.role === "admin"
				}
				title={
					dialog?.type === "role" && dialog.user.role === "admin"
						? "Remove their admin access?"
						: "Make this person an admin?"
				}
				description={(user) =>
					user.role === "admin"
						? `${user.name || user.email} goes back to a regular account and loses access to this page.`
						: `${user.name || user.email} will be able to add, block and delete users, set temporary passwords, and open or close sign-ups. They can’t touch your account or change who’session an admin.`
				}
				action={
					dialog?.type === "role" && dialog.user.role === "admin"
						? "Remove admin"
						: "Make admin"
				}
				run={async (user) => {
					const admin = user.role === "admin"
					const { error } = await authClient.admin.setRole({
						userId: user.id,
						role: admin ? "user" : "admin",
					})
					if (error) {
						return error.message ?? "Could not change their role"
					}
					toast.success(admin ? "No longer an admin" : "Now an admin")
					onFlash()
					onRefresh()
					return null
				}}
			/>
			<AdminUserConfirmDialog
				user={dialog?.type === "ban" ? dialog.user : null}
				onClose={onClose}
				title="Block this person from logging in?"
				description={(user) =>
					`${user.name || user.email} is logged out everywhere and can’t log in until you restore access. Their data is kept.`
				}
				action="Block login"
				run={async (user) => {
					const { error } = await authClient.admin.banUser({
						userId: user.id,
					})
					if (error) {
						return error.message ?? "Could not block this user"
					}
					toast.success("Login blocked")
					onFlash()
					onRefresh()
					return null
				}}
			/>
			<AdminUserConfirmDialog
				user={dialog?.type === "delete" ? dialog.user : null}
				onClose={onClose}
				title="Delete this user and their data?"
				description={(user) =>
					`${user.name || user.email}’session account, linked banks, saved bank logins, transactions, subscriptions, goals and work hours are removed for good. This can’t be undone.`
				}
				action="Delete user"
				confirmText={(user) => user.email}
				run={async (user) => {
					const { error } = await authClient.admin.removeUser({
						userId: user.id,
					})
					if (error) {
						return error.message ?? "Could not delete this user"
					}
					toast.success("User deleted")
					onFlash()
					onRefresh()
					return null
				}}
			/>
		</>
	)
}
