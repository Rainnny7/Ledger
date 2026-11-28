import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import {
	convertToModelMessages,
	generateText,
	stepCountIs,
	streamText,
	type UIMessage,
} from "ai"
import { Elysia } from "elysia"
import { z } from "zod"
import { aiChatAvailable } from "../auth/index.ts"
import { env } from "../config/env.ts"
import { boundedArray, jsonBody } from "../http/validation.ts"
import { sessionUser } from "../routes/session.ts"
import { AI_CHAT_RATE_WINDOW_MS, aiChatLimits } from "./limits.ts"
import {
	buildChatSuggestionsSystemPrompt,
	buildChatSystemPrompt,
	buildChatTitleSystemPrompt,
} from "./system-prompt.ts"
import { createChatTools, financeToolDefinitions } from "./tools.ts"

const CHAT_TOOL_PART_TYPES = new Set(
	financeToolDefinitions.map((definition) => `tool-${definition.name}`)
)

const followUpLine = z.string().trim().min(1).max(60)

/** Strip bullets, numbering, and wrapping quotes from one model output line. */
function stripSuggestionLine(line: string): string {
	return line
		.replace(/^[\s•\-*]+/, "")
		.replace(/^\d+[.)]\s*/, "")
		.replace(/^["'“”‘’]+/, "")
		.replace(/["'“”‘’]+$/, "")
		.trim()
}

const TITLE_MAX_LENGTH = 60

/** Clean a model-generated title: first line only, no quotes or trailing punctuation, capped length. */
export function parseChatTitle(raw: string): string | null {
	const firstLine = raw.split(/\r?\n/).find((line) => line.trim().length > 0)
	if (!firstLine) {
		return null
	}
	const cleaned = stripSuggestionLine(firstLine)
		.replace(/^title:\s*/i, "")
		.replace(/[.!?:;,]+$/, "")
		.trim()
	if (!cleaned) {
		return null
	}
	return cleaned.length > TITLE_MAX_LENGTH
		? `${cleaned.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
		: cleaned
}

/** Parse model plain-text into up to three validated follow-up questions. */
export function parseFollowUpSuggestions(raw: string): string[] {
	const seen = new Set<string>()
	const suggestions: string[] = []
	for (const line of raw.split(/\r?\n/)) {
		const cleaned = stripSuggestionLine(line)
		const parsed = followUpLine.safeParse(cleaned)
		if (!parsed.success) {
			continue
		}
		const normalized = parsed.data.toLowerCase()
		if (seen.has(normalized)) {
			continue
		}
		seen.add(normalized)
		suggestions.push(parsed.data)
		if (suggestions.length >= 3) {
			break
		}
	}
	return suggestions
}

/**
 * One UI message part, checked against an allow-list: text, reasoning, step markers and this app's own
 * tool calls. Anything else (notably `file` and `source-url` parts, whose URLs the model provider
 * would fetch) is refused so a client cannot make the server fetch arbitrary URLs.
 */
const uiMessagePart = z
	.looseObject({
		type: z.string(),
		text: z.string().optional(),
	})
	.superRefine((part, context) => {
		if (part.type === "text") {
			if (typeof part.text !== "string") {
				context.addIssue({
					code: "custom",
					message: "Text parts need a text field.",
					path: ["text"],
				})
			}
			return
		}
		if (part.type === "reasoning" || part.type === "step-start") {
			return
		}
		if (
			part.type === "dynamic-tool" ||
			(part.type.startsWith("tool-") &&
				CHAT_TOOL_PART_TYPES.has(part.type))
		) {
			const toolCallId = (part as { toolCallId?: unknown }).toolCallId
			if (typeof toolCallId !== "string" || toolCallId.length === 0) {
				context.addIssue({
					code: "custom",
					message: "Tool parts need a toolCallId.",
					path: ["toolCallId"],
				})
			}
			return
		}
		if (part.type.startsWith("tool-")) {
			context.addIssue({
				code: "custom",
				message: `Unknown tool part "${part.type}".`,
			})
			return
		}
		context.addIssue({
			code: "custom",
			message: `Message part type "${part.type}" is not supported.`,
		})
	})

const uiMessage = z.looseObject({
	id: z.string().min(1).max(120),
	role: z.enum(["user", "assistant", "system"]),
	parts: z.array(uiMessagePart).min(1).max(200),
})

const chatBody = z
	.object({
		messages: boundedArray(
			uiMessage,
			aiChatLimits.messagesPerConversation
		).min(1),
	})
	.superRefine((body, context) => {
		let chars = 0
		for (const message of body.messages) {
			for (const part of message.parts) {
				if (part.type === "text" && part.text) {
					chars += part.text.length
				}
			}
		}
		if (chars > aiChatLimits.maxConversationChars) {
			context.addIssue({
				code: "custom",
				message: `Conversation text exceeds ${aiChatLimits.maxConversationChars} characters.`,
				path: ["messages"],
			})
		}
	})

const chatAttempts = new Map<string, number[]>()
const suggestionsAttempts = new Map<string, number[]>()

function chatRateLimited(userId: string): boolean {
	const now = Date.now()
	const recent = (chatAttempts.get(userId) ?? []).filter(
		(time) => now - time < AI_CHAT_RATE_WINDOW_MS
	)
	if (recent.length >= aiChatLimits.chatRequestsPerTenMinutes) {
		chatAttempts.set(userId, recent)
		return true
	}
	recent.push(now)
	chatAttempts.set(userId, recent)
	return false
}

function suggestionsRateLimited(userId: string): boolean {
	const now = Date.now()
	const recent = (suggestionsAttempts.get(userId) ?? []).filter(
		(time) => now - time < AI_CHAT_RATE_WINDOW_MS
	)
	if (recent.length >= aiChatLimits.followUpSuggestionsPerTenMinutes) {
		suggestionsAttempts.set(userId, recent)
		return true
	}
	recent.push(now)
	suggestionsAttempts.set(userId, recent)
	return false
}

/** Logged-in AI chat route (streaming UIMessage protocol). */
export const chatRoutes = new Elysia({ name: "chat-routes" }).use(sessionUser)

chatRoutes.post(
	"/chat",
	async ({ user, body, request, status }) => {
		if (!aiChatAvailable()) {
			return status(503, {
				error: "AI chat isn't set up on this server.",
			})
		}
		if (chatRateLimited(user.id)) {
			return status(429, {
				error: "Too many chat requests. Try again in a few minutes.",
			})
		}
		const gateway = createOpenAICompatible({
			name: "ai-gateway",
			baseURL: env.AI_BASE_URL,
			apiKey: env.AI_API_KEY,
		})
		const messages = body.messages as UIMessage[]
		const modelMessages = await convertToModelMessages(messages)
		const result = streamText({
			model: gateway(env.AI_MODEL),
			system: buildChatSystemPrompt(),
			messages: modelMessages,
			tools: createChatTools(user.id),
			stopWhen: stepCountIs(aiChatLimits.maxToolStepsPerAnswer),
			abortSignal: request.signal,
		})
		return result.toUIMessageStreamResponse()
	},
	{ body: jsonBody(chatBody) }
)

chatRoutes.post(
	"/chat/suggestions",
	async ({ user, body, request, status }) => {
		if (!aiChatAvailable()) {
			return status(503, {
				error: "AI chat isn't set up on this server.",
			})
		}
		if (suggestionsRateLimited(user.id)) {
			return status(429, {
				error: "Too many suggestion requests. Try again in a few minutes.",
			})
		}
		const recentMessages = body.messages.slice(
			-aiChatLimits.suggestionsMessageSlice
		)
		const gateway = createOpenAICompatible({
			name: "ai-gateway",
			baseURL: env.AI_BASE_URL,
			apiKey: env.AI_API_KEY,
		})
		try {
			const modelMessages = await convertToModelMessages(
				recentMessages as UIMessage[]
			)
			const { text } = await generateText({
				model: gateway(env.AI_MODEL),
				system: [
					buildChatSuggestionsSystemPrompt(),
					"Reply with exactly three follow-up questions, one per line.",
					"Do not number them, use bullets, or wrap them in quotes.",
				].join("\n"),
				messages: modelMessages,
				abortSignal: request.signal,
			})
			return { suggestions: parseFollowUpSuggestions(text) }
		} catch {
			return { suggestions: [] as string[] }
		}
	},
	{ body: jsonBody(chatBody) }
)

chatRoutes.post(
	"/chat/title",
	async ({ user, body, request, status }) => {
		if (!aiChatAvailable()) {
			return status(503, {
				error: "AI chat isn't set up on this server.",
			})
		}
		// Titles are requested once per conversation, so they share the suggestions budget.
		if (suggestionsRateLimited(user.id)) {
			return status(429, {
				error: "Too many title requests. Try again in a few minutes.",
			})
		}
		const openingMessages = body.messages.slice(
			0,
			aiChatLimits.titleMessageSlice
		)
		const gateway = createOpenAICompatible({
			name: "ai-gateway",
			baseURL: env.AI_BASE_URL,
			apiKey: env.AI_API_KEY,
		})
		try {
			const modelMessages = await convertToModelMessages(
				openingMessages as UIMessage[]
			)
			const { text } = await generateText({
				model: gateway(env.AI_MODEL),
				system: buildChatTitleSystemPrompt(),
				messages: [
					...modelMessages,
					{
						role: "user",
						content: "Write the title for this conversation now.",
					},
				],
				abortSignal: request.signal,
			})
			return { title: parseChatTitle(text) }
		} catch {
			return { title: null }
		}
	},
	{ body: jsonBody(chatBody) }
)
