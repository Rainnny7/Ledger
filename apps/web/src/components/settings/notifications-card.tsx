import { toast } from "sonner"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "cn"
import {
	type NotificationSource,
	useDiscordWebhookStatus,
	useNotificationPreferences,
	useSetNotificationPreference,
	type NotificationPreferences,
} from "@/lib/queries"
import { DiscordWebhookSection } from "./discord-webhook-section"

type SetPreferenceVariables = {
	source: NotificationSource
	email: boolean
	inApp: boolean
	discord: boolean
}

const SOURCES: {
	source: NotificationSource
	label: string
	description: string
}[] = [
	{
		source: "security",
		label: "Security notices",
		description: "For example, a password was added to your account.",
	},
	{
		source: "digest",
		label: "Monthly spending digest",
		description: "Also needs the digest turned on in Preferences.",
	},
]

function channelSavedMessage(
	label: string,
	channel: "email" | "in-app" | "discord",
	on: boolean
) {
	const name =
		channel === "email"
			? "email"
			: channel === "in-app"
				? "in-app"
				: "Discord"
	return `${label}: ${name} ${on ? "on" : "off"}`
}

function NotificationSourceRow({
	source,
	label,
	description,
	preferences,
	discordConfigured,
	onSave,
}: {
	source: NotificationSource
	label: string
	description: string
	preferences: NotificationPreferences | null | undefined
	discordConfigured: boolean
	onSave: ReturnType<typeof useSetNotificationPreference>["mutate"]
}) {
	const { saved, flash } = useSavedFlash()
	const preference = preferences?.[source]
	const emailOn = preference?.email ?? false
	const inAppOn = preference?.inApp ?? false
	const discordOn = preference?.discord ?? false
	const rowOff =
		preference !== undefined && !emailOn && !inAppOn && !discordOn

	function save(
		channel: "email" | "in-app" | "discord",
		next: boolean,
		payload: SetPreferenceVariables
	) {
		if (!preferences) {
			return
		}
		onSave(payload, {
			onSuccess: () => {
				toast.success(channelSavedMessage(label, channel, next))
				flash()
			},
		})
	}

	return (
		<div className="grid grid-cols-[1fr_4rem_4rem_4rem] items-center gap-x-2 gap-y-1 py-4 first:pt-0 last:pb-0">
			<div className="min-w-0 pr-2">
				<span
					id={`notify-${source}-label`}
					className={cn(
						"flex items-center gap-2 text-sm font-medium",
						rowOff && "text-muted-foreground"
					)}
				>
					{label}
					<SavedIndicator saved={saved} showLabel={false} />
				</span>
				<p className="text-sm text-muted-foreground">{description}</p>
				{rowOff ? (
					<p className="text-xs text-muted-foreground">Off</p>
				) : null}
			</div>
			<div className="flex w-16 justify-center justify-self-center">
				<Switch
					checked={emailOn}
					disabled={!preferences}
					aria-label={`Email for ${label}`}
					onCheckedChange={(nextEmail) => {
						save("email", nextEmail, {
							source,
							email: nextEmail,
							inApp: preferences![source].inApp,
							discord: preferences![source].discord,
						})
					}}
				/>
			</div>
			<div className="flex w-16 justify-center justify-self-center">
				<Switch
					checked={inAppOn}
					disabled={!preferences}
					aria-label={`In-app for ${label}`}
					onCheckedChange={(nextInApp) => {
						save("in-app", nextInApp, {
							source,
							email: preferences![source].email,
							inApp: nextInApp,
							discord: preferences![source].discord,
						})
					}}
				/>
			</div>
			<div className="flex w-16 flex-col items-center gap-0.5 justify-self-center">
				<Switch
					checked={discordOn}
					disabled={!preferences || !discordConfigured}
					aria-label={`Discord for ${label}`}
					title={
						discordConfigured
							? undefined
							: "Save a Discord webhook below first"
					}
					onCheckedChange={(nextDiscord) => {
						save("discord", nextDiscord, {
							source,
							email: preferences![source].email,
							inApp: preferences![source].inApp,
							discord: nextDiscord,
						})
					}}
				/>
				{!discordConfigured ? (
					<span className="text-center text-[10px] leading-tight text-muted-foreground">
						Needs webhook
					</span>
				) : null}
			</div>
		</div>
	)
}

/** Lets the user choose email, in-app, and/or Discord delivery for each notification source. */
export function NotificationsCard() {
	const { data: preferences } = useNotificationPreferences()
	const { data: discordStatus } = useDiscordWebhookStatus()
	const setPreference = useSetNotificationPreference()
	const discordConfigured = discordStatus?.configured ?? false

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notifications</CardTitle>
				<div
					className="grid grid-cols-[1fr_4rem_4rem_4rem] items-end gap-x-2"
					role="row"
				>
					<CardDescription className="pr-2">
						Choose where each kind of message reaches you. Turn all
						channels off to stop it.
					</CardDescription>
					<span
						role="columnheader"
						className="text-center text-xs font-medium text-muted-foreground uppercase"
					>
						Email
					</span>
					<span
						role="columnheader"
						className="text-center text-xs font-medium text-muted-foreground uppercase"
					>
						In-app
					</span>
					<span
						role="columnheader"
						className="text-center text-xs font-medium text-muted-foreground uppercase"
					>
						Discord
					</span>
				</div>
			</CardHeader>
			<CardContent>
				<div className="divide-y divide-border">
					{SOURCES.map(({ source, label, description }) => (
						<NotificationSourceRow
							key={source}
							source={source}
							label={label}
							description={description}
							preferences={preferences}
							discordConfigured={discordConfigured}
							onSave={setPreference.mutate}
						/>
					))}
				</div>
				<DiscordWebhookSection />
			</CardContent>
		</Card>
	)
}
