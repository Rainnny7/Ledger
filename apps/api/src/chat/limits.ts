/** Ten-minute sliding window used for per-user chat rate limits. */
export const AI_CHAT_RATE_WINDOW_MS = 10 * 60 * 1000

/** POST body size cap for chat and suggestions (large UIMessage payloads). */
export const AI_CHAT_MAX_REQUEST_BYTES = 512 * 1024

/** API paths that use {@link AI_CHAT_MAX_REQUEST_BYTES} instead of the default JSON cap. */
export const AI_CHAT_BODY_PATHS = new Set([
	"/api/banks/chat",
	"/api/banks/chat/suggestions",
])

/** Hard limits for the finance AI chat (enforced on the server and shown in Admin settings). */
export const aiChatLimits = {
	messagesPerConversation: 200,
	maxConversationChars: 100_000,
	chatRequestsPerTenMinutes: 30,
	followUpSuggestionsPerTenMinutes: 60,
	maxToolStepsPerAnswer: 50,
	/** How many recent messages are sent when generating follow-up suggestions. */
	suggestionsMessageSlice: 6,
} as const
