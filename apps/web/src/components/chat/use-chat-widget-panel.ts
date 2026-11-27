import { demoMode, demoPersona } from "@/lib/demo"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, isTextUIPart } from "ai"
import { useCallback, useMemo, useRef, useState } from "react"
import { CHAT_API, TIME_ZONE } from "@/components/chat/chat-widget-constants"
import { chatErrorMessage } from "@/components/chat/chat-widget-errors"
import {
	useAskLedgerQueueDrain,
	useChatFollowUpSuggestions,
	useChatPanelDismiss,
} from "@/components/chat/use-chat-widget-effects"

/** Chat transport, message state, and panel interaction handlers. */
export function useChatWidgetPanel() {
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: CHAT_API,
				credentials: "include",
				headers: {
					"X-Timezone": TIME_ZONE,
					...(demoMode ? { "X-Ledger-Demo": demoPersona.id } : {}),
				},
				prepareSendMessagesRequest: ({
					messages,
					api,
					headers,
					credentials,
				}) => ({
					api,
					headers,
					credentials,
					body: { messages },
				}),
			}),
		[]
	)

	const chat = useChat({ transport })
	const [input, setInput] = useState("")
	const [open, setOpen] = useState(false)
	const [newChatConfirmOpen, setNewChatConfirmOpen] = useState(false)
	const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([])
	const [followUpHidden, setFollowUpHidden] = useState(false)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const panelRef = useRef<HTMLElement>(null)
	const toggleRef = useRef<HTMLButtonElement>(null)
	const suggestionsAbortRef = useRef<AbortController | null>(null)

	const busy = chat.status === "submitted" || chat.status === "streaming"
	const displayError = chat.error ? chatErrorMessage(chat.error) : null
	const showThinking =
		busy &&
		(chat.messages.length === 0 ||
			chat.messages.at(-1)?.role === "user" ||
			(chat.messages.at(-1)?.role === "assistant" &&
				!chat.messages
					.at(-1)
					?.parts.some(
						(part) =>
							isTextUIPart(part) && part.text.trim().length > 0
					)))

	const submitText = useCallback(
		(text: string) => {
			const trimmed = text.trim()
			if (!trimmed || busy) {
				return
			}
			suggestionsAbortRef.current?.abort()
			setFollowUpSuggestions([])
			setFollowUpHidden(true)
			chat.clearError()
			void chat.sendMessage({ text: trimmed })
			setInput("")
		},
		[busy, chat]
	)

	const resetChat = useCallback(() => {
		suggestionsAbortRef.current?.abort()
		void chat.stop()
		chat.setMessages([])
		chat.clearError()
		setInput("")
		setFollowUpSuggestions([])
		setFollowUpHidden(false)
		setNewChatConfirmOpen(false)
		textareaRef.current?.focus()
	}, [chat])

	const handleNewChatClick = useCallback(() => {
		if (chat.messages.length === 0) {
			resetChat()
		}
	}, [chat.messages.length, resetChat])

	const showFollowUps =
		!busy && !followUpHidden && followUpSuggestions.length > 0

	useChatFollowUpSuggestions({
		status: chat.status,
		error: chat.error,
		messages: chat.messages,
		abortRef: suggestionsAbortRef,
		setFollowUpSuggestions,
		setFollowUpHidden,
	})
	useAskLedgerQueueDrain({ busy, setOpen, submitText })

	const toggleOpen = useCallback(() => {
		setOpen((previous) => !previous)
	}, [])

	const closePanel = useCallback(() => {
		setOpen(false)
	}, [])

	const clickIsOutsidePanel = useCallback((target: EventTarget | null) => {
		if (!(target instanceof Node)) {
			return true
		}
		if (panelRef.current?.contains(target)) {
			return false
		}
		if (toggleRef.current?.contains(target)) {
			return false
		}
		if (target instanceof Element) {
			if (target.closest('[data-slot="popover-content"]')) {
				return false
			}
			if (target.closest('[data-slot="tooltip-content"]')) {
				return false
			}
			if (target.closest('[role="dialog"], [data-streamdown]')) {
				return false
			}
		}
		return true
	}, [])

	useChatPanelDismiss({
		open,
		newChatConfirmOpen,
		clickIsOutsidePanel,
		closePanel,
	})

	return {
		...chat,
		input,
		setInput,
		open,
		newChatConfirmOpen,
		setNewChatConfirmOpen,
		followUpSuggestions,
		setFollowUpHidden,
		textareaRef,
		panelRef,
		toggleRef,
		busy,
		displayError,
		showThinking,
		submitText,
		resetChat,
		handleNewChatClick,
		showFollowUps,
		toggleOpen,
		closePanel,
	}
}
