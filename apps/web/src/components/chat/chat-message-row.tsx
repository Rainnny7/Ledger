import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message"
import { ToolStatusChip } from "@/components/ai-elements/tool"
import { isTextUIPart, isToolUIPart, type ToolUIPart, type UIMessage } from "ai"

const TOOL_STATUS_LABEL = "Checking your transactions…"

/** Label shown while the assistant runs transaction tools. */
function toolStatusLabel(_part: ToolUIPart): string {
	return TOOL_STATUS_LABEL
}

/** One row in the scrollable message list. */
export function ChatMessageRow({ message }: { message: UIMessage }) {
	const isUser = message.role === "user"
	const textParts = message.parts.filter(
		(part): part is Extract<typeof part, { type: "text" }> =>
			isTextUIPart(part) && part.text.trim().length > 0
	)
	const toolParts = message.parts.filter((part): part is ToolUIPart =>
		isToolUIPart(part)
	)

	if (isUser) {
		const userText = textParts.map((textPart) => textPart.text).join("\n")
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
				{toolParts.map((part, toolIndex) => (
					<ToolStatusChip
						key={`${message.id}-tool-${toolIndex}`}
						label={toolStatusLabel(part)}
						state={part.state}
					/>
				))}
				{textParts.map((textPart, textIndex) => (
					<MessageResponse key={`${message.id}-text-${textIndex}`}>
						{textPart.text}
					</MessageResponse>
				))}
			</MessageContent>
		</Message>
	)
}
