import { SparklesIcon } from "@/components/icons/sparkles"
import { ConversationEmptyState } from "@/components/ai-elements/conversation"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { SUGGESTED_QUESTIONS } from "@/components/chat/chat-widget-constants"

/** Starter suggestions when the chat has no messages yet. */
export function ChatWidgetEmptyState({
	busy,
	onSubmit,
}: {
	busy: boolean
	onSubmit: (text: string) => void
}) {
	return (
		<ConversationEmptyState className="justify-center py-4">
			<div className="flex w-full max-w-sm flex-col items-center gap-3">
				<div className="flex size-9 items-center justify-center rounded-full bg-muted">
					<SparklesIcon
						size={16}
						className="flex text-muted-foreground"
					/>
				</div>
				<div className="space-y-0.5">
					<h3 className="text-[13px] font-medium">
						What can I help with?
					</h3>
					<p className="text-[13px] text-muted-foreground">
						Ask about your spending, subscriptions, goals, or
						accounts.
					</p>
				</div>
				<Suggestions className="w-full justify-center">
					{SUGGESTED_QUESTIONS.map((question) => (
						<Suggestion
							key={question}
							suggestion={question}
							disabled={busy}
							onClick={onSubmit}
						/>
					))}
				</Suggestions>
			</div>
		</ConversationEmptyState>
	)
}
