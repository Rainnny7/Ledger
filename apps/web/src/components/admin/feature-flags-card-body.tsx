import { FeatureFlagToggleRow } from "@/components/admin/feature-flag-toggle-row"
import { FeatureFlagsAiLimits } from "@/components/admin/feature-flags-ai-limits"
import type { useFeatureFlagToggles } from "@/components/admin/use-feature-flag-toggles"
import { Badge } from "@/components/ui/badge"

/** Toggle rows for the admin feature flags card. */
export function FeatureFlagsCardBody({
	settings,
	saving,
	regSaved,
	aiSaved,
	mcpSaved,
	toggleRegistration,
	toggleAiChat,
	toggleMcp,
}: ReturnType<typeof useFeatureFlagToggles>) {
	const open = settings.data?.registrationOpen ?? false
	const aiChat = settings.data?.aiChat
	const settingsError = !!settings.error

	return (
		<>
			<FeatureFlagToggleRow
				title="Sign-ups"
				description="Let anyone with the link create their own account. You can still add people yourself when this is off."
				badge={
					settings.data ? (
						open ? (
							<Badge>Open</Badge>
						) : (
							<Badge variant="secondary">Closed</Badge>
						)
					) : undefined
				}
				saved={regSaved}
				pending={settings.isPending}
				settingsError={settingsError}
				checked={open}
				disabled={saving !== null}
				onCheckedChange={toggleRegistration}
				ariaLabel="Allow sign-ups"
			/>
			<div className="grid gap-3 border-t pt-6">
				<FeatureFlagToggleRow
					title="AI chat"
					description={
						aiChat?.configured
							? "Signed-in users see the finance assistant in the corner."
							: "Set AI_API_KEY on the server to enable."
					}
					badge={
						aiChat?.configured && settings.data ? (
							aiChat.enabled ? (
								<Badge>On</Badge>
							) : (
								<Badge variant="secondary">Off</Badge>
							)
						) : undefined
					}
					saved={aiSaved}
					pending={settings.isPending}
					settingsError={settingsError}
					checked={aiChat?.enabled ?? false}
					disabled={saving !== null || !aiChat?.configured}
					onCheckedChange={toggleAiChat}
					ariaLabel="Enable AI chat"
				/>
				{aiChat ? <FeatureFlagsAiLimits aiChat={aiChat} /> : null}
			</div>
			<div className="border-t pt-6">
				<FeatureFlagToggleRow
					title="MCP server"
					description="Let users connect read-only access to their own finances from Claude Desktop and other MCP clients with a personal token."
					badge={
						settings.data ? (
							settings.data.mcp.enabled ? (
								<Badge>On</Badge>
							) : (
								<Badge variant="secondary">Off</Badge>
							)
						) : undefined
					}
					saved={mcpSaved}
					pending={settings.isPending}
					settingsError={settingsError}
					checked={settings.data?.mcp.enabled ?? false}
					disabled={saving !== null}
					onCheckedChange={toggleMcp}
					ariaLabel="Enable MCP server"
				/>
			</div>
		</>
	)
}
