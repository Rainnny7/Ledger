import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CopyIcon } from "@/components/icons/copy"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useAdminSettings } from "@/components/admin/use-admin-settings"
import type { ReleaseChannel } from "@/components/admin/admin-types"
import { adminFetch, auditKey } from "@/lib/admin"
import { copyText } from "@/lib/clipboard"
import { queryClient, queryKeys, useUpdate } from "@/lib/queries"
import { toastError } from "@/lib/toast"

const CHANNEL_OPTIONS: { value: ReleaseChannel; label: string }[] = [
	{ value: "stable", label: "Stable (master, latest)" },
	{ value: "dev", label: "Dev (newest ver/* branch)" },
]

/** Admin release channel selector with a one-click container switch or copy-paste commands. */
export function ReleaseChannelCard() {
	const settings = useAdminSettings()
	const { data: info } = useUpdate(true)
	const [busy, setBusy] = useState(false)
	const channel = settings.data?.releaseChannel ?? "stable"

	async function changeChannel(next: ReleaseChannel) {
		setBusy(true)
		try {
			await adminFetch("settings", {
				method: "PUT",
				body: JSON.stringify({ releaseChannel: next }),
			})
			await settings.refetch()
			await queryClient.invalidateQueries({ queryKey: queryKeys.update })
			void queryClient.invalidateQueries({ queryKey: auditKey })
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setBusy(false)
		}
	}

	async function switchNow() {
		setBusy(true)
		try {
			await adminFetch("update/switch", { method: "POST" })
			toast.success(
				"Switching now. Ledger restarts in a moment; reload the page after."
			)
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setBusy(false)
		}
	}

	const script = info?.commands.join("\n") ?? ""
	return (
		<Card>
			<CardHeader>
				<CardTitle>Release Channel</CardTitle>
				<CardDescription>
					Stable follows the latest release. Dev follows the newest
					in-development version and may be unfinished.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<Select
					items={CHANNEL_OPTIONS}
					value={channel}
					onValueChange={(value) =>
						value && void changeChannel(value as ReleaseChannel)
					}
				>
					<SelectTrigger
						aria-label="Release Channel"
						disabled={
							busy || settings.isPending || info?.install !== "docker"
						}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CHANNEL_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{info?.install === "docker" ? (
					<div className="grid gap-2">
						{info.canSwitch ? (
							<div className="flex flex-wrap items-center gap-3">
								<Button
									type="button"
									size="sm"
									disabled={busy || !info.imageTag}
									onClick={() => void switchNow()}
								>
									Pull and switch to{" "}
									{info.imageTag ?? "the selected channel"}
								</Button>
								<span className="text-xs text-muted-foreground">
									Ledger will restart.
								</span>
							</div>
						) : (
							<p className="text-xs text-muted-foreground">
								One-click switching needs the Docker socket
								mounted into the container (see SELF_HOSTING.md).
								Without it, run these on the server:
							</p>
						)}
						{!info.canSwitch ? (
							<div className="grid gap-2">
								<div className="flex justify-end">
									<Button
										type="button"
										size="xs"
										variant="outline"
										onClick={() =>
											void copyText(script, "Commands")
										}
									>
										<CopyIcon size={24} className="flex" />{" "}
										Copy
									</Button>
								</div>
								<pre className="overflow-x-auto rounded-md border bg-muted/60 p-3 font-mono text-xs leading-relaxed">
									{script}
								</pre>
							</div>
						) : null}
						<p className="text-xs text-muted-foreground">
							A later <code>docker compose up</code> goes back to
							the image tag in your docker-compose.yml.
						</p>
					</div>
				) : (
					<p className="text-xs text-muted-foreground">
						Release channels only apply to Docker installs. From-source
						installs update with git: check out the branch you want,
						then pull and rebuild.
					</p>
				)}
			</CardContent>
		</Card>
	)
}
