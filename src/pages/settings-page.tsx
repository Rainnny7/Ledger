import { Alert, AlertDescription } from "@/components/ui/alert"
import { AppearanceCard } from "@/components/settings/appearance-card"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { DeleteAccountCard } from "@/components/settings/delete-account-card"
import { DevicesCard } from "@/components/settings/devices-card"
import { PreferencesCard } from "@/components/settings/preferences-card"
import { TwoFactorCard } from "@/components/settings/two-factor-card"
import { demoMode } from "@/lib/demo"

/** Profile, appearance, currency, demo mode, and account security. */
export function SettingsPage() {
	return (
		<div className="grid gap-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Settings
				</h1>
				<p className="text-sm text-muted-foreground">
					Preferences, security and your account.
				</p>
			</div>
			{demoMode && (
				<Alert>
					<AlertDescription>
						Demo mode: preferences changed here only last until you
						exit demo mode. Everything else is turned off.
					</AlertDescription>
				</Alert>
			)}
			<AppearanceCard />
			<PreferencesCard />
			{demoMode ? (
				<div
					inert
					aria-disabled
					className="grid gap-8 opacity-50 select-none"
				>
					<ChangePasswordCard />
					<TwoFactorCard />
					<DeleteAccountCard />
				</div>
			) : (
				<>
					<ChangePasswordCard />
					<TwoFactorCard />
					<DevicesCard />
					<DeleteAccountCard />
				</>
			)}
		</div>
	)
}
