import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	useDiscordWebhookStatus,
	useRemoveDiscordWebhook,
	useSaveDiscordWebhook,
	useTestDiscordWebhook,
} from "@/lib/queries"

/** Lets the user save, remove, and test a Discord incoming-webhook URL. */
export function DiscordWebhookSection() {
	const { data: status } = useDiscordWebhookStatus()
	const saveWebhook = useSaveDiscordWebhook()
	const removeWebhook = useRemoveDiscordWebhook()
	const testWebhook = useTestDiscordWebhook()
	const [url, setUrl] = useState("")
	const configured = status?.configured ?? false

	return (
		<div className="mt-6 space-y-3 border-t border-border pt-6">
			<div className="space-y-1">
				<h3 className="text-sm font-medium">Discord webhook</h3>
				<p className="text-sm text-muted-foreground">
					In Discord, open a channel&apos;s settings → Integrations →
					Webhooks → New Webhook. Copy the webhook URL and paste it
					here. Ledger stores it encrypted and never shows it again
					after you save.
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="discord-webhook-url">Webhook URL</Label>
				<Input
					id="discord-webhook-url"
					type="password"
					autoComplete="off"
					placeholder={
						configured
							? "Webhook saved — paste a new URL to replace"
							: "https://discord.com/api/webhooks/…"
					}
					value={url}
					onChange={(event) => setUrl(event.target.value)}
				/>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					disabled={!url.trim() || saveWebhook.isPending}
					onClick={() => {
						saveWebhook.mutate(url.trim(), {
							onSuccess: () => {
								setUrl("")
								toast.success("Discord webhook saved")
							},
						})
					}}
				>
					{saveWebhook.isPending ? (
						<Loader2 className="size-4 animate-spin" />
					) : null}
					Save
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={!configured || removeWebhook.isPending}
					onClick={() => {
						removeWebhook.mutate(undefined, {
							onSuccess: () => {
								setUrl("")
								toast.success("Discord webhook removed")
							},
						})
					}}
				>
					Remove
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={!configured || testWebhook.isPending}
					onClick={() => {
						testWebhook.mutate(undefined, {
							onSuccess: (result) => {
								if (result.ok) {
									toast.success(
										"Test message sent to Discord"
									)
								} else {
									toast.error(
										"Discord did not accept the test message"
									)
								}
							},
						})
					}}
				>
					{testWebhook.isPending ? (
						<Loader2 className="size-4 animate-spin" />
					) : null}
					Send test
				</Button>
			</div>
		</div>
	)
}
