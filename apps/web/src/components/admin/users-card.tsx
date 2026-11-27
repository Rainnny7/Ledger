import { UserPlusIcon } from "@/components/icons/user-plus"
import { AdminUserList } from "@/components/admin/admin-user-list"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"
import { toastError } from "@/lib/toast"
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
import { QueryError } from "@/components/ui/query-error"
import { Skeleton } from "@/components/ui/skeleton"
import {
	type AdminUser,
	type UserDialog,
	isDemoEmail,
	usersKey,
} from "@/components/admin/admin-types"
import { useAdminSettings } from "@/components/admin/use-admin-settings"
import { UsersCardDialogs } from "@/components/admin/users-card-dialogs"
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
	const { saved, flash } = useSavedFlash()

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
			flash()
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
					<SavedIndicator saved={saved} showLabel={false} />
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
				{users.data ? (
					<AdminUserList
						users={users.data}
						sessionUserId={session?.user.id}
						ownerId={ownerId}
						iAmOwner={iAmOwner}
						busy={busy}
						onDialog={setDialog}
						onAct={act}
					/>
				) : null}
			</CardContent>

			<UsersCardDialogs
				dialog={dialog}
				iAmOwner={iAmOwner}
				onClose={() => setDialog(null)}
				onRefresh={refresh}
				onFlash={flash}
			/>
		</Card>
	)
}
