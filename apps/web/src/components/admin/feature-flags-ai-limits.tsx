import type { useAdminSettings } from "@/components/admin/use-admin-settings"

/** Read-only AI chat rate limits from admin settings. */
export function FeatureFlagsAiLimits({
	aiChat,
}: {
	aiChat: NonNullable<ReturnType<typeof useAdminSettings>["data"]>["aiChat"]
}) {
	if (!aiChat?.configured) {
		return null
	}
	return (
		<dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
			<div>
				<dt className="inline after:content-[':']">Model</dt>{" "}
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
					{aiChat.limits.chatRequestsPerTenMinutes} / 10 min
				</dd>
			</div>
			<div>
				<dt className="inline after:content-[':']">
					Follow-up suggestions
				</dt>{" "}
				<dd className="inline text-foreground">
					{aiChat.limits.followUpSuggestionsPerTenMinutes} / 10 min
				</dd>
			</div>
			<div>
				<dt className="inline after:content-[':']">Max tool steps</dt>{" "}
				<dd className="inline text-foreground">
					{aiChat.limits.maxToolStepsPerAnswer} per answer
				</dd>
			</div>
		</dl>
	)
}
