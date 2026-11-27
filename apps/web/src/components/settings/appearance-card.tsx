import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	AppearanceAccentPicker,
	AppearanceModePicker,
} from "@/components/settings/appearance-pickers"
import { demoMode } from "@/lib/demo"

/** Mode and accent pickers, saved to the account (or the browser in demo mode). */
export function AppearanceCard() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Appearance</CardTitle>
				<CardDescription>
					{demoMode
						? "Pick a mode and an accent colour. In demo mode they’re kept in this browser only."
						: "Pick a mode and an accent colour. They’re saved to your account, so they follow you to every device."}
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-6">
				<AppearanceModePicker />
				<AppearanceAccentPicker />
			</CardContent>
		</Card>
	)
}
