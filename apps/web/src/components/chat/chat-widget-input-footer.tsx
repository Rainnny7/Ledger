import { Loader } from "@/components/ai-elements/loader"
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { Square } from "lucide-react"
import type { RefObject } from "react"

/** Message list, error banner, follow-ups, and prompt input. */
export function ChatWidgetInputFooter({
	busy,
	status,
	input,
	displayError,
	showFollowUps,
	followUpSuggestions,
	textareaRef,
	onInputChange,
	onSubmit,
	onStop,
	onFollowUp,
}: {
	busy: boolean
	status: "submitted" | "streaming" | "ready" | "error"
	input: string
	displayError: string | null
	showFollowUps: boolean
	followUpSuggestions: string[]
	textareaRef: RefObject<HTMLTextAreaElement | null>
	onInputChange: (value: string) => void
	onSubmit: (text: string) => void
	onStop: () => void
	onFollowUp: (text: string) => void
}) {
	return (
		<>
			{displayError ? (
				<p
					role="alert"
					className="shrink-0 border-t border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
				>
					{displayError}
				</p>
			) : null}
			<footer className="shrink-0 border-t px-2.5 py-2">
				{showFollowUps ? (
					<Suggestions className="mb-1.5 w-full">
						{followUpSuggestions.map((suggestion) => (
							<Suggestion
								key={suggestion}
								suggestion={suggestion}
								disabled={busy}
								onClick={onFollowUp}
							/>
						))}
					</Suggestions>
				) : null}
				<p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
					Private to you. Only the data needed to answer is sent to
					the AI model.
				</p>
				<PromptInput onSubmit={({ text }) => onSubmit(text)}>
					<PromptInputTextarea
						ref={textareaRef}
						value={input}
						disabled={busy}
						aria-label="Message"
						onChange={(event) => onInputChange(event.target.value)}
					/>
					<PromptInputFooter>
						{busy ? (
							<PromptInputButton
								aria-label="Stop response"
								variant="destructive"
								className="border-destructive/40 bg-destructive text-white hover:bg-destructive/90 hover:text-white"
								onClick={() => void onStop()}
							>
								<Square className="size-4 fill-current" />
							</PromptInputButton>
						) : (
							<PromptInputSubmit
								aria-label="Send message"
								disabled={!input.trim()}
								status={status}
							/>
						)}
					</PromptInputFooter>
				</PromptInput>
			</footer>
		</>
	)
}

/** Thinking indicator under the message list while streaming. */
export function ChatWidgetThinking({ show }: { show: boolean }) {
	if (!show) {
		return null
	}
	return (
		<div
			className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
			aria-live="polite"
		>
			<Loader size={14} />
			<span>Thinking…</span>
		</div>
	)
}
