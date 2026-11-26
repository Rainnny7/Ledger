import { ActivityCard } from "@/components/admin/activity-card"
import { SendNotificationCard } from "@/components/admin/send-notification-card"
import { SmtpCard } from "@/components/admin/smtp-card"
import { BuildInfo } from "@/components/admin/build-info"
import { DemoCard } from "@/components/admin/demo-card"
import { FeatureFlagsCard } from "@/components/admin/feature-flags-card"
import { BackupsCard } from "@/components/admin/backups-card"
import { TasksCard } from "@/components/admin/tasks-card"
import { ReleaseChannelCard } from "@/components/admin/release-channel-card"
import { UpdateStatus } from "@/components/admin/update-status"
import { UsersCard } from "@/components/admin/users-card"
import { useAdminSettings } from "@/components/admin/use-admin-settings"
import { useSession } from "@/lib/auth-client"

/** Server admin: users, backups, tasks, updates, and demo data (owners only). */
export function AdminPage() {
	const { data: session } = useSession()
	const settings = useAdminSettings()
	const ownerId = settings.data?.ownerId ?? null
	const showBackups = !!session?.user.id && session.user.id === ownerId
	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Admin
					</h1>
					<p className="text-sm text-muted-foreground">
						People who can use this Ledger, and who may sign up.
					</p>
				</div>
				<div className="flex flex-col items-end gap-1">
					<BuildInfo />
					<UpdateStatus />
				</div>
			</div>
			<div className="grid items-start gap-8 lg:grid-cols-2">
				<div className="grid gap-8">
					<FeatureFlagsCard />
					<ReleaseChannelCard />
					<DemoCard />
				</div>
				<div className="grid gap-8">
					<UsersCard />
					<TasksCard showBackupTask={showBackups} />
				</div>
			</div>
			<div className="grid items-stretch gap-8 lg:grid-cols-2">
				<SmtpCard />
				<SendNotificationCard />
			</div>
			{showBackups ? <BackupsCard /> : null}
			<ActivityCard />
		</div>
	)
}
