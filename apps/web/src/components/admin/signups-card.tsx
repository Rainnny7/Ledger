import { useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { Badge } from "@/components/ui/badge"
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
import { Switch } from "@/components/ui/switch"
import { useAdminSettings } from "@/components/admin/use-admin-settings"
import { adminFetch, auditKey } from "@/lib/admin"
import { queryClient } from "@/lib/queries"

/** Signups UI card. */
export function SignupsCard() {
	const settings = useAdminSettings()
	const [saving, setSaving] = useState(false)
	const open = settings.data?.registrationOpen ?? false

	async function toggle(next: boolean) {
		setSaving(true)
		try {
			await adminFetch("settings", {
				method: "PUT",
				body: JSON.stringify({ registrationOpen: next }),
			})
			await settings.refetch()
			void queryClient.invalidateQueries({ queryKey: auditKey })
			toast.success(
				next ? "Anyone can now create an account" : "Sign-ups closed"
			)
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Sign-ups
					{settings.data &&
						(open ? (
							<Badge>Open</Badge>
						) : (
							<Badge variant="secondary">Closed</Badge>
						))}
				</CardTitle>
				<CardDescription>
					Let anyone with the link create their own account. You can
					still add people yourself when this is off.
				</CardDescription>
				<CardAction>
					{settings.isPending ? (
						<Skeleton className="h-5 w-9 rounded-full" />
					) : (
						<Switch
							checked={open}
							disabled={saving || !!settings.error}
							onCheckedChange={(value) => void toggle(value)}
							aria-label="Allow sign-ups"
						/>
					)}
				</CardAction>
			</CardHeader>
			{settings.error && !settings.data && (
				<CardContent>
					<QueryError
						message={settings.error.message}
						onRetry={() => void settings.refetch()}
					/>
				</CardContent>
			)}
		</Card>
	)
}
