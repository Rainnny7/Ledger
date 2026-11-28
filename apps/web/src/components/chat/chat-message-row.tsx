import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ToolStatusChip } from "@/components/ai-elements/tool"
import type { ChatSettings } from "@/components/chat/chat-storage"
import {
	isReasoningUIPart,
	isTextUIPart,
	isToolUIPart,
	type ReasoningUIPart,
	type ToolUIPart,
	type UIMessage,
} from "ai"

const TOOL_STATUS_LABEL = "Checking your transactions…"

/** Label for one tool call: friendly generic text, or the real tool name when tool calls are shown. */
function toolStatusLabel(part: ToolUIPart, showToolCalls: boolean): string {
	return showToolCalls ? part.type.replace(/^tool-/, "") : TOOL_STATUS_LABEL
}

/** Collapsible JSON block used for tool inputs and outputs. */
function JsonBlock({ title, value }: { title: string; value: unknown }) {
	return (
		<div>
			<p className="text-[11px] font-medium text-muted-foreground">
				{title}
			</p>
			<pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-snug whitespace-pre-wrap">
				{JSON.stringify(value, null, 2)}
			</pre>
		</div>
	)
}

/** Tool chip plus, when enabled, an expandable view of the call's input and result. */
function ToolCall({
	part,
	showToolCalls,
}: {
	part: ToolUIPart
	showToolCalls: boolean
}) {
	const chip = (
		<ToolStatusChip
			label={toolStatusLabel(part, showToolCalls)}
			state={part.state}
		/>
	)
	if (!showToolCalls) {
		return chip
	}
	return (
		<Collapsible className="rounded-md border px-2 py-1">
			<CollapsibleTrigger className="w-full cursor-pointer text-left">
				{chip}
			</CollapsibleTrigger>
			<CollapsibleContent className="space-y-2 pt-1 pb-1">
				{part.input === undefined ? null : (
					<JsonBlock title="Input" value={part.input} />
				)}
				{part.state === "output-available" ? (
					<JsonBlock title="Result" value={part.output} />
				) : null}
				{part.state === "output-error" ? (
					<p className="text-[11px] text-destructive">
						{part.errorText}
					</p>
				) : null}
			</CollapsibleContent>
		</Collapsible>
	)
}

/** Expandable model reasoning. */
function Reasoning({ part }: { part: ReasoningUIPart }) {
	return (
		<Collapsible
			className="rounded-md border px-2 py-1"
			defaultOpen={part.state === "streaming"}
		>
			<CollapsibleTrigger className="cursor-pointer text-[11px] font-medium text-muted-foreground">
				{part.state === "streaming" ? "Thinking…" : "Reasoning"}
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-1 pb-1 text-xs whitespace-pre-wrap text-muted-foreground">
				{part.text}
			</CollapsibleContent>
		</Collapsible>
	)
}

/** One row in the scrollable message list. */
export function ChatMessageRow({
	message,
	settings,
}: {
	message: UIMessage
	settings: ChatSettings
}) {
	const isUser = message.role === "user"

	if (isUser) {
		const userText = message.parts
			.filter(isTextUIPart)
			.filter((part) => part.text.trim().length > 0)
			.map((part) => part.text)
			.join("\n")
		if (!userText) {
			return null
		}
		return (
			<Message from="user">
				<MessageContent>
					<p className="whitespace-pre-wrap">{userText}</p>
				</MessageContent>
			</Message>
		)
	}

	return (
		<Message from="assistant">
			<MessageContent className="space-y-2">
				{message.parts.map((part, partIndex) => {
					const key = `${message.id}-${partIndex}`
					if (isToolUIPart(part) && part.type !== "dynamic-tool") {
						return (
							<ToolCall
								key={key}
								part={part}
								showToolCalls={settings.showToolCalls}
							/>
						)
					}
					if (isReasoningUIPart(part)) {
						return settings.showReasoning &&
							part.text.trim().length > 0 ? (
							<Reasoning key={key} part={part} />
						) : null
					}
					if (isTextUIPart(part) && part.text.trim().length > 0) {
						return (
							<MessageResponse key={key}>
								{part.text}
							</MessageResponse>
						)
					}
					return null
				})}
			</MessageContent>
		</Message>
	)
}
