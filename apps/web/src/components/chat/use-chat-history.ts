import { isTextUIPart, type UIMessage } from "ai"
import { useCallback, useEffect, useRef, useState } from "react"
import {
	CHAT_TITLE_API,
	TIME_ZONE,
} from "@/components/chat/chat-widget-constants"
import {
	loadConversations,
	saveConversations,
	type StoredConversation,
} from "@/components/chat/chat-storage"
import { demoMode, demoPersona } from "@/lib/demo"

/** Placeholder title from the first user message, shown until the AI-generated title arrives. */
function fallbackTitle(messages: UIMessage[]): string {
	const firstUser = messages.find((message) => message.role === "user")
	const text = firstUser?.parts
		.filter(isTextUIPart)
		.map((part) => part.text)
		.join(" ")
		.trim()
	if (!text) {
		return "New chat"
	}
	return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

/** Asks the server for a short summary title; resolves to null on any failure. */
async function requestTitle(messages: UIMessage[]): Promise<string | null> {
	try {
		const response = await fetch(CHAT_TITLE_API, {
			method: "POST",
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				"X-Timezone": TIME_ZONE,
				...(demoMode ? { "X-Ledger-Demo": demoPersona.id } : {}),
			},
			body: JSON.stringify({ messages }),
		})
		if (!response.ok) {
			return null
		}
		const data = (await response.json()) as { title?: string | null }
		return data.title ?? null
	} catch {
		return null
	}
}

/**
 * Keeps saved conversations in localStorage in sync with the live chat.
 * A conversation is saved only when a reply finishes streaming, so opening an old chat
 * never reorders the list. After the first reply, the server generates a summary title once.
 */
export function useChatHistory({
	messages,
	status,
	setMessages,
}: {
	messages: UIMessage[]
	status: string
	setMessages: (messages: UIMessage[]) => void
}) {
	const [conversations, setConversations] =
		useState<StoredConversation[]>(loadConversations)
	const [activeId, setActiveId] = useState<string | null>(null)
	const activeIdRef = useRef<string | null>(null)
	const previousStatusRef = useRef(status)
	const titleRequestsRef = useRef(new Set<string>())

	// Mirrors state synchronously so the save effect can read the stored entry it just wrote.
	const conversationsRef = useRef(conversations)

	const updateConversations = useCallback(
		(update: (previous: StoredConversation[]) => StoredConversation[]) => {
			const next = update(conversationsRef.current)
			conversationsRef.current = next
			saveConversations(next)
			setConversations(next)
		},
		[]
	)

	const generateTitle = useCallback(
		(id: string, conversationMessages: UIMessage[]) => {
			if (titleRequestsRef.current.has(id)) {
				return
			}
			titleRequestsRef.current.add(id)
			void requestTitle(conversationMessages).then((title) => {
				if (!title) {
					// Allow a retry after the next reply.
					titleRequestsRef.current.delete(id)
					return
				}
				updateConversations((previous) =>
					previous.map((entry) =>
						entry.id === id
							? { ...entry, title, titled: true }
							: entry
					)
				)
			})
		},
		[updateConversations]
	)

	useEffect(() => {
		const previousStatus = previousStatusRef.current
		previousStatusRef.current = status
		const replyFinished =
			(previousStatus === "streaming" ||
				previousStatus === "submitted") &&
			status === "ready"
		if (!replyFinished || messages.length === 0) {
			return
		}
		const id = activeIdRef.current ?? crypto.randomUUID()
		if (activeIdRef.current !== id) {
			activeIdRef.current = id
			setActiveId(id)
		}
		const existing = conversationsRef.current.find(
			(entry) => entry.id === id
		)
		const titled = existing?.titled ?? false
		updateConversations((previous) => {
			const entry: StoredConversation = {
				id,
				title: existing?.titled
					? existing.title
					: fallbackTitle(messages),
				titled,
				updatedAt: Date.now(),
				messages,
			}
			return [entry, ...previous.filter((other) => other.id !== id)]
		})
		const hasAssistantReply = messages.some(
			(message) =>
				message.role === "assistant" &&
				message.parts.some(
					(part) => isTextUIPart(part) && part.text.trim().length > 0
				)
		)
		if (!titled && hasAssistantReply) {
			generateTitle(id, messages)
		}
	}, [messages, status, updateConversations, generateTitle])

	/** Forgets the active conversation so the next message starts a new history entry. */
	const startNewConversation = useCallback(() => {
		activeIdRef.current = null
		setActiveId(null)
	}, [])

	/** Loads a saved conversation into the chat without changing its place in the list. */
	const openConversation = useCallback(
		(id: string) => {
			const target = conversations.find((entry) => entry.id === id)
			if (!target || activeIdRef.current === id) {
				return
			}
			activeIdRef.current = target.id
			setActiveId(target.id)
			setMessages(target.messages)
		},
		[conversations, setMessages]
	)

	const deleteConversation = useCallback(
		(id: string) => {
			if (activeIdRef.current === id) {
				activeIdRef.current = null
				setActiveId(null)
			}
			updateConversations((previous) =>
				previous.filter((entry) => entry.id !== id)
			)
		},
		[updateConversations]
	)

	return {
		conversations,
		activeId,
		startNewConversation,
		openConversation,
		deleteConversation,
	}
}
