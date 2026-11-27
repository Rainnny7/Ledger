import { useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { Badge } from "@/components/ui/badge"
import {
	Card,
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

type Saving = "registration" | "aiChat" | "mcp" | null

/** Admin toggles for instance-wide features (sign-ups, AI chat). */
export function FeatureFlagsCard() {
	const settings = useAdminSettings()
	const [saving, setSaving] = useState<Saving>(null)
	const open = settings.data?.registrationOpen ?? false
	const aiChat = settings.data?.aiChat

	async function toggleRegistration(next: boolean) {
		setSaving("registration")
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
			setSaving(null)
		}
	}

	async function toggleAiChat(next: boolean) {
		setSaving("aiChat")
		try {
			await adminFetch("settings", {
				method: "PUT",
				body: JSON.stringify({ aiChatEnabled: next }),
			})
			await settings.refetch()
			void queryClient.invalidateQueries({ queryKey: auditKey })
			void queryClient.invalidateQueries({ queryKey: ["config"] })
			toast.success(next ? "AI chat enabled" : "AI chat disabled")
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(null)
		}
	}

	async function toggleMcp(next: boolean) {
		setSaving("mcp")
		try {
			await adminFetch("settings", {
				method: "PUT",
				body: JSON.stringify({ mcpEnabled: next }),
			})
			await settings.refetch()
			void queryClient.invalidateQueries({ queryKey: auditKey })
			void queryClient.invalidateQueries({ queryKey: ["config"] })
			toast.success(next ? "MCP server enabled" : "MCP server disabled")
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(null)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Feature Flags</CardTitle>
				<CardDescription>
					Turn optional features on or off for everyone on this
					server.
				</CardDescription>
			</CardHeader>
			{settings.error && !settings.data ? (
				<CardContent>
					<QueryError
						message={settings.error.message}
						onRetry={() => void settings.refetch()}
					/>
				</CardContent>
			) : (
				<CardContent className="grid gap-6">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-1">
							<p className="flex items-center gap-2 text-sm font-medium">
								Sign-ups
								{settings.data &&
									(open ? (
										<Badge>Open</Badge>
									) : (
										<Badge variant="secondary">
											Closed
										</Badge>
									))}
							</p>
							<p className="text-sm text-muted-foreground">
								Let anyone with the link create their own
								account. You can still add people yourself when
								this is off.
							</p>
						</div>
						{settings.isPending ? (
							<Skeleton className="h-5 w-9 shrink-0 rounded-full" />
						) : (
							<Switch
								className="shrink-0"
								checked={open}
								disabled={saving !== null || !!settings.error}
								onCheckedChange={(value) =>
									void toggleRegistration(value)
								}
								aria-label="Allow sign-ups"
							/>
						)}
					</div>
					<div className="grid gap-3 border-t pt-6">
						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<p className="flex items-center gap-2 text-sm font-medium">
									AI chat
									{aiChat?.configured &&
										settings.data &&
										(aiChat.enabled ? (
											<Badge>On</Badge>
										) : (
											<Badge variant="secondary">
												Off
											</Badge>
										))}
								</p>
								<p className="text-sm text-muted-foreground">
									{aiChat?.configured
										? "Signed-in users see the finance assistant in the corner."
										: "Set AI_API_KEY on the server to enable."}
								</p>
							</div>
							{settings.isPending ? (
								<Skeleton className="h-5 w-9 shrink-0 rounded-full" />
							) : (
								<Switch
									className="shrink-0"
									checked={aiChat?.enabled ?? false}
									disabled={
										saving !== null ||
										!!settings.error ||
										!aiChat?.configured
									}
									onCheckedChange={(value) =>
										void toggleAiChat(value)
									}
									aria-label="Enable AI chat"
								/>
							)}
						</div>
						{aiChat?.configured ? (
							<dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
								<div>
									<dt className="inline after:content-[':']">
										Model
									</dt>{" "}
									<dd className="inline font-mono text-foreground">
										{aiChat.model}
									</dd>
								</div>
								<div>
									<dt className="inline after:content-[':']">
										Messages per conversation
									</dt>{" "}
									<dd className="inline text-foreground">
										{aiChat.limits.messagesPerConversation}
									</dd>
								</div>
								<div>
									<dt className="inline after:content-[':']">
										Max conversation size
									</dt>{" "}
									<dd className="inline text-foreground">
										{aiChat.limits.maxConversationChars.toLocaleString()}{" "}
										characters
									</dd>
								</div>
								<div>
									<dt className="inline after:content-[':']">
										Requests per user
									</dt>{" "}
									<dd className="inline text-foreground">
										{
											aiChat.limits
												.chatRequestsPerTenMinutes
										}{" "}
										/ 10 min
									</dd>
								</div>
								<div>
									<dt className="inline after:content-[':']">
										Follow-up suggestions
									</dt>{" "}
									<dd className="inline text-foreground">
										{
											aiChat.limits
												.followUpSuggestionsPerTenMinutes
										}{" "}
										/ 10 min
									</dd>
								</div>
								<div>
									<dt className="inline after:content-[':']">
										Max tool steps
									</dt>{" "}
									<dd className="inline text-foreground">
										{aiChat.limits.maxToolStepsPerAnswer}{" "}
										per answer
									</dd>
								</div>
							</dl>
						) : null}
					</div>
					<div className="flex items-start justify-between gap-4 border-t pt-6">
						<div className="space-y-1">
							<p className="flex items-center gap-2 text-sm font-medium">
								MCP server
								{settings.data &&
									(settings.data.mcp.enabled ? (
										<Badge>On</Badge>
									) : (
										<Badge variant="secondary">Off</Badge>
									))}
							</p>
							<p className="text-sm text-muted-foreground">
								Let users connect read-only access to their own
								finances from Claude Desktop and other MCP
								clients with a personal token.
							</p>
						</div>
						{settings.isPending ? (
							<Skeleton className="h-5 w-9 shrink-0 rounded-full" />
						) : (
							<Switch
								className="shrink-0"
								checked={settings.data?.mcp.enabled ?? false}
								disabled={saving !== null || !!settings.error}
								onCheckedChange={(value) =>
									void toggleMcp(value)
								}
								aria-label="Enable MCP server"
							/>
						)}
					</div>
				</CardContent>
			)}
		</Card>
	)
}
