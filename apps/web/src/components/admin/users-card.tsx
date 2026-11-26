import { WithContextMenu } from "@/components/layout/app-context-menu"
import { UserPlusIcon } from "@/components/icons/user-plus"
import { AdminUserMenuItems } from "@/components/admin/user-menu"
import { useQuery } from "@tanstack/react-query"
import { Crown, Loader2, MoreHorizontal, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QueryError } from "@/components/ui/query-error"
import { Skeleton } from "@/components/ui/skeleton"
import {
	type AdminUser,
	type UserDialog,
	isDemoEmail,
	usersKey,
} from "@/components/admin/admin-types"
import { userInitials, userJoined } from "@/components/admin/admin-user-utils"
import { useAdminSettings } from "@/components/admin/use-admin-settings"
import {
	AddUserDialog,
	AdminUserConfirmDialog,
	SetPasswordDialog,
} from "@/components/admin/user-dialogs"
import { authClient, useSession } from "@/lib/auth-client"
import { auditKey } from "@/lib/admin"
import { queryClient } from "@/lib/queries"

/** Users UI card. */
export function UsersCard() {
	const { data: session } = useSession()
	const settings = useAdminSettings()
	const ownerId = settings.data?.ownerId ?? null
	const iAmOwner = !!session && session.user.id === ownerId
	const users = useQuery({
		queryKey: usersKey,
		queryFn: async () => {
			const { data, error } = await authClient.admin.listUsers({
				query: {
					limit: 500,
					sortBy: "createdAt",
					sortDirection: "asc",
				},
			})
			if (error) {
				throw new Error(error.message ?? "Could not load users")
			}
			return (data.users as AdminUser[]).filter(
				(user) => !isDemoEmail(user.email)
			)
		},
	})
	const [dialog, setDialog] = useState<UserDialog | null>(null)
	const [busy, setBusy] = useState<string | null>(null)

	async function act(
		user: AdminUser,
		label: string,
		run: () => Promise<{ error: { message?: string } | null }>
	) {
		setBusy(user.id)
		const { error } = await run()
		setBusy(null)
		if (error) {
			toastError(error.message ?? "Something went wrong")
		} else {
			toast.success(label)
		}
		refresh()
	}

	function refresh() {
		void users.refetch()
		void queryClient.invalidateQueries({ queryKey: auditKey })
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Users
					{users.data && (
						<Badge variant="secondary">{users.data.length}</Badge>
					)}
				</CardTitle>
				<CardDescription>
					Each person sees only their own banks and data. Admins can
					also open this page; only the owner can choose who’session
					an admin.
				</CardDescription>
				<CardAction>
					<Button
						size="sm"
						onClick={() => setDialog({ type: "add" })}
					>
						<UserPlusIcon size={24} className="flex" /> Add user
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="grid gap-1">
				{users.isPending &&
					[0, 1].map((index) => (
						<div
							key={index}
							className="flex items-center gap-3 px-2 py-2"
						>
							<Skeleton className="size-8 rounded-full" />
							<div className="grid flex-1 gap-1.5">
								<Skeleton className="h-3.5 w-32" />
								<Skeleton className="h-3 w-48" />
							</div>
						</div>
					))}
				{users.error && !users.data && (
					<QueryError
						message={users.error.message}
						onRetry={() => void users.refetch()}
					/>
				)}
				{users.data?.map((user, index) => {
					const isMe = user.id === session?.user.id
					const isAdmin = user.role === "admin"
					const isOwner = user.id === ownerId
					// Nobody else can manage the owner'session account.
					const manageable = !isMe && (!isOwner || iAmOwner)
					const busyUser = busy === user.id
					const menuItems = manageable ? (
						<AdminUserMenuItems
							user={user}
							iAmOwner={iAmOwner}
							isAdmin={isAdmin}
							disabled={busyUser}
							onRole={() => setDialog({ type: "role", user })}
							onPassword={() =>
								setDialog({ type: "password", user })
							}
							onRevokeSessions={() =>
								void act(user, "Logged out everywhere", () =>
									authClient.admin.revokeUserSessions({
										userId: user.id,
									})
								)
							}
							onUnban={() =>
								void act(user, "Access restored", () =>
									authClient.admin.unbanUser({
										userId: user.id,
									})
								)
							}
							onBan={() => setDialog({ type: "ban", user })}
							onDelete={() => setDialog({ type: "delete", user })}
						/>
					) : null
					return (
						<WithContextMenu key={user.id} menu={menuItems}>
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
										{isMe && (
											<Badge variant="outline">You</Badge>
										)}
										{isOwner ? (
											<Badge>
												<Crown /> Owner
											</Badge>
										) : (
											isAdmin && <Badge>Admin</Badge>
										)}
										{user.mustChangePassword && (
											<Badge variant="outline">
												Temporary password
											</Badge>
										)}
										{user.banned && (
											<Badge variant="destructive">
												Banned
											</Badge>
										)}
										{user.twoFactorEnabled && (
											<Badge variant="secondary">
												<ShieldCheck /> 2FA
											</Badge>
										)}
									</div>
									<div className="truncate text-xs text-muted-foreground">
										{user.email} · joined{" "}
										{userJoined.format(
											new Date(user.createdAt)
										)}
									</div>
								</div>
								{busyUser && (
									<Loader2 className="size-4 animate-spin text-muted-foreground" />
								)}
								{manageable && (
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
										<DropdownMenuContent
											align="end"
											className="w-52"
										>
											{menuItems}
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</div>
						</WithContextMenu>
					)
				})}
			</CardContent>

			<AddUserDialog
				open={dialog?.type === "add"}
				canAddAdmins={iAmOwner}
				onClose={() => setDialog(null)}
				onAdded={refresh}
			/>
			<SetPasswordDialog
				user={dialog?.type === "password" ? dialog.user : null}
				onClose={() => setDialog(null)}
				onDone={refresh}
			/>
			<AdminUserConfirmDialog
				user={dialog?.type === "role" ? dialog.user : null}
				onClose={() => setDialog(null)}
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
					refresh()
					return null
				}}
			/>
			<AdminUserConfirmDialog
				user={dialog?.type === "ban" ? dialog.user : null}
				onClose={() => setDialog(null)}
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
					refresh()
					return null
				}}
			/>
			<AdminUserConfirmDialog
				user={dialog?.type === "delete" ? dialog.user : null}
				onClose={() => setDialog(null)}
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
					refresh()
					return null
				}}
			/>
		</Card>
	)
}
