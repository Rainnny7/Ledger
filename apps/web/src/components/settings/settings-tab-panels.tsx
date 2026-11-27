import { ActivityCard } from "@/components/admin/activity-card"
import { BuildInfo } from "@/components/admin/build-info"
import { BackupsCard } from "@/components/admin/backups-card"
import { DemoCard } from "@/components/admin/demo-card"
import { FeatureFlagsCard } from "@/components/admin/feature-flags-card"
import { ReleaseChannelCard } from "@/components/admin/release-channel-card"
import { SendNotificationCard } from "@/components/admin/send-notification-card"
import { SmtpCard } from "@/components/admin/smtp-card"
import { TasksCard } from "@/components/admin/tasks-card"
import { UpdateStatus } from "@/components/admin/update-status"
import { UsersCard } from "@/components/admin/users-card"
import { useAdminSettings } from "@/components/admin/use-admin-settings"
import { ApiKeysCard } from "@/components/settings/api-keys-card"
import { AppearanceCard } from "@/components/settings/appearance-card"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { DeleteAccountCard } from "@/components/settings/delete-account-card"
import { EmailVerificationCard } from "@/components/settings/email-verification-card"
import { DevicesCard } from "@/components/settings/devices-card"
import { McpAccessCard } from "@/components/settings/mcp-access-card"
import { NotificationsCard } from "@/components/settings/notifications-card"
import { PreferencesCard } from "@/components/settings/preferences-card"
import { TwoFactorCard } from "@/components/settings/two-factor-card"
import { demoMode } from "@/lib/demo"
import { useAppConfig } from "@/lib/queries"
import { useSession } from "@/lib/auth-client"
import type { ReactNode } from "react"

/** Wraps a settings card so search can scroll to and highlight it. */
export function SettingsSection({
	sectionId,
	children,
}: {
	sectionId: string
	children: ReactNode
}) {
	return (
		<div
			id={`settings-section-${sectionId}`}
			className="scroll-mt-6 rounded-xl transition-shadow duration-500"
		>
			{children}
		</div>
	)
}

/** Appearance tab panel. */
export function SettingsAppearancePanel() {
	return (
		<SettingsSection sectionId="appearance">
			<AppearanceCard />
		</SettingsSection>
	)
}

/** Preferences tab panel. */
export function SettingsPreferencesPanel() {
	return (
		<div className="grid gap-8">
			<SettingsSection sectionId="preferences">
				<PreferencesCard />
			</SettingsSection>
		</div>
	)
}

/** Notifications tab panel. */
export function SettingsNotificationsPanel() {
	return (
		<SettingsSection sectionId="notification-sources">
			<NotificationsCard />
		</SettingsSection>
	)
}

/** Security tab panel (matches former settings page demo behaviour). */
export function SettingsSecurityPanel() {
	return (
		<div className="grid gap-8">
			{demoMode ? (
				<div
					inert
					aria-disabled
					className="grid gap-8 opacity-50 select-none"
				>
					<SettingsSection sectionId="password">
						<ChangePasswordCard />
					</SettingsSection>
					<SettingsSection sectionId="two-factor">
						<TwoFactorCard />
					</SettingsSection>
					<SettingsSection sectionId="delete-account">
						<DeleteAccountCard />
					</SettingsSection>
				</div>
			) : (
				<>
					<SettingsSection sectionId="email">
						<EmailVerificationCard />
					</SettingsSection>
					<SettingsSection sectionId="password">
						<ChangePasswordCard />
					</SettingsSection>
					<SettingsSection sectionId="two-factor">
						<TwoFactorCard />
					</SettingsSection>
					<SettingsSection sectionId="devices">
						<DevicesCard />
					</SettingsSection>
				</>
			)}
		</div>
	)
}

/** Developer tab panel. */
export function SettingsDeveloperPanel() {
	const config = useAppConfig()
	if (demoMode) {
		return null
	}
	return (
		<div className="grid gap-8">
			<SettingsSection sectionId="api-keys">
				<ApiKeysCard />
			</SettingsSection>
			{config?.mcp ? (
				<SettingsSection sectionId="mcp">
					<McpAccessCard />
				</SettingsSection>
			) : null}
		</div>
	)
}

/** Account tab panel. */
export function SettingsAccountPanel() {
	return (
		<SettingsSection sectionId="delete-account">
			{demoMode ? (
				<div inert aria-disabled className="opacity-50 select-none">
					<DeleteAccountCard />
				</div>
			) : (
				<DeleteAccountCard />
			)}
		</SettingsSection>
	)
}

/** Admin general tab panel. */
export function SettingsServerGeneralPanel() {
	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border bg-muted/30 px-4 py-3">
				<BuildInfo />
				<UpdateStatus />
			</div>
			<SettingsSection sectionId="feature-flags">
				<FeatureFlagsCard />
			</SettingsSection>
			<SettingsSection sectionId="release-channel">
				<ReleaseChannelCard />
			</SettingsSection>
			<SettingsSection sectionId="demo-data">
				<DemoCard />
			</SettingsSection>
		</div>
	)
}

/** Admin users tab panel. */
export function SettingsServerUsersPanel() {
	return (
		<SettingsSection sectionId="users">
			<UsersCard />
		</SettingsSection>
	)
}

/** Admin email tab panel. */
export function SettingsServerEmailPanel() {
	return (
		<div className="grid gap-8">
			<SettingsSection sectionId="smtp">
				<SmtpCard />
			</SettingsSection>
			<SettingsSection sectionId="notifications">
				<SendNotificationCard />
			</SettingsSection>
		</div>
	)
}

/** Admin tasks and backups tab panel. */
export function SettingsServerTasksPanel() {
	const { data: session } = useSession()
	const settings = useAdminSettings()
	const ownerId = settings.data?.ownerId ?? null
	const showBackups = !!session?.user.id && session.user.id === ownerId
	return (
		<div className="grid gap-8">
			<SettingsSection sectionId="tasks">
				<TasksCard showBackupTask={showBackups} />
			</SettingsSection>
			{showBackups ? (
				<SettingsSection sectionId="backups">
					<BackupsCard />
				</SettingsSection>
			) : null}
		</div>
	)
}

/** Admin activity tab panel. */
export function SettingsServerActivityPanel() {
	return (
		<SettingsSection sectionId="activity">
			<ActivityCard />
		</SettingsSection>
	)
}
