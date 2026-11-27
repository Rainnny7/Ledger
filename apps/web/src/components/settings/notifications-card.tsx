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
	useNotificationPreferences,
	useSetNotificationPreference,
	type NotificationPreferences,
} from "@/lib/queries"

type SetPreferenceVariables = {
	source: NotificationSource
	email: boolean
	inApp: boolean
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
	channel: "email" | "in-app",
	on: boolean
) {
	const name = channel === "email" ? "email" : "in-app"
	return `${label}: ${name} ${on ? "on" : "off"}`
}

function NotificationSourceRow({
	source,
	label,
	description,
	preferences,
	onSave,
}: {
	source: NotificationSource
	label: string
	description: string
	preferences: NotificationPreferences | null | undefined
	onSave: ReturnType<typeof useSetNotificationPreference>["mutate"]
}) {
	const { saved, flash } = useSavedFlash()
	const preference = preferences?.[source]
	const emailOn = preference?.email ?? false
	const inAppOn = preference?.inApp ?? false
	const rowOff = preference !== undefined && !emailOn && !inAppOn

	function save(
		channel: "email" | "in-app",
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
		<div className="grid grid-cols-[1fr_4rem_4rem] items-center gap-x-2 gap-y-1 py-4 first:pt-0 last:pb-0">
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
						})
					}}
				/>
			</div>
		</div>
	)
}

/** Lets the user choose email and/or in-app delivery for each notification source. */
export function NotificationsCard() {
	const { data: preferences } = useNotificationPreferences()
	const setPreference = useSetNotificationPreference()

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notifications</CardTitle>
				<div
					className="grid grid-cols-[1fr_4rem_4rem] items-end gap-x-2"
					role="row"
				>
					<CardDescription className="pr-2">
						Choose where each kind of message reaches you. Turn both
						off to stop it.
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
							onSave={setPreference.mutate}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	)
}