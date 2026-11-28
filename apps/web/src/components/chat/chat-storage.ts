import type { UIMessage } from "ai"

const HISTORY_KEY = "ledger.chat.history"
const SETTINGS_KEY = "ledger.chat.settings"
const SIZE_KEY = "ledger.chat.size"
const MAX_STORED_CONVERSATIONS = 30

/** One saved conversation shown in the chat history list. */
export type StoredConversation = {
	id: string
	title: string
	/** True once the server has generated a summary title. */
	titled?: boolean
	updatedAt: number
	messages: UIMessage[]
}

/** Display preferences for the chat panel. */
export type ChatSettings = {
	showToolCalls: boolean
	showReasoning: boolean
}

/** Panel dimensions in CSS pixels. */
export type ChatPanelSize = {
	width: number
	height: number
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
	showToolCalls: false,
	showReasoning: false,
}

export const DEFAULT_CHAT_SIZE: ChatPanelSize = { width: 520, height: 640 }
export const MIN_CHAT_SIZE: ChatPanelSize = { width: 320, height: 360 }

/** Reads and parses a JSON value from localStorage; returns null when missing, blocked or malformed. */
function readJson(key: string): unknown {
	try {
		const raw = window.localStorage.getItem(key)
		return raw ? (JSON.parse(raw) as unknown) : null
	} catch {
		return null
	}
}

/** Writes a JSON value to localStorage, ignoring quota or privacy-mode failures. */
function writeJson(key: string, value: unknown) {
	try {
		window.localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Storage unavailable or full: the chat still works for this session.
	}
}

/** Loads saved conversations, newest first. */
export function loadConversations(): StoredConversation[] {
	const value = readJson(HISTORY_KEY)
	if (!Array.isArray(value)) {
		return []
	}
	return value
		.filter(
			(entry): entry is StoredConversation =>
				typeof entry?.id === "string" &&
				typeof entry.title === "string" &&
				typeof entry.updatedAt === "number" &&
				Array.isArray(entry.messages)
		)
		.toSorted((first, second) => second.updatedAt - first.updatedAt)
}

/** Persists conversations, keeping only the most recent ones. */
export function saveConversations(conversations: StoredConversation[]) {
	writeJson(HISTORY_KEY, conversations.slice(0, MAX_STORED_CONVERSATIONS))
}

/** Loads chat display settings, falling back to defaults. */
export function loadChatSettings(): ChatSettings {
	const value = readJson(SETTINGS_KEY) as Partial<ChatSettings> | null
	return {
		showToolCalls:
			value?.showToolCalls ?? DEFAULT_CHAT_SETTINGS.showToolCalls,
		showReasoning:
			value?.showReasoning ?? DEFAULT_CHAT_SETTINGS.showReasoning,
	}
}

/** Persists chat display settings. */
export function saveChatSettings(settings: ChatSettings) {
	writeJson(SETTINGS_KEY, settings)
}

/** Loads the last panel size, falling back to the wide default. */
export function loadChatSize(): ChatPanelSize {
	const value = readJson(SIZE_KEY) as Partial<ChatPanelSize> | null
	if (typeof value?.width === "number" && typeof value.height === "number") {
		return {
			width: Math.max(MIN_CHAT_SIZE.width, value.width),
			height: Math.max(MIN_CHAT_SIZE.height, value.height),
		}
	}
	return DEFAULT_CHAT_SIZE
}

/** Persists the panel size. */
export function saveChatSize(size: ChatPanelSize) {
	writeJson(SIZE_KEY, size)
}
