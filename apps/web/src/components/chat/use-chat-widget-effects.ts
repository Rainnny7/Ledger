import { demoMode, demoPersona } from "@/lib/demo"
import {
	peekAskLedgerQueue,
	shiftAskLedgerQueue,
	subscribeAskLedger,
} from "@/lib/ask-ledger"
import { isTextUIPart, type UIMessage } from "ai"
import {
	useEffect,
	useEffectEvent,
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
} from "react"

const CHAT_SUGGESTIONS_API = "/api/banks/chat/suggestions"
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

/** Returns true when the last message is a non-empty assistant reply. */
function lastAssistantHasText(messages: UIMessage[]): boolean {
	const last = messages.at(-1)
	if (last?.role !== "assistant") {
		return false
	}
	return last.parts.some(
		(part) => isTextUIPart(part) && part.text.trim().length > 0
	)
}

/** Loads follow-up suggestions after a completed assistant message. */
export function useChatFollowUpSuggestions({
	status,
	error,
	messages,
	abortRef,
	setFollowUpSuggestions,
	setFollowUpHidden,
}: {
	status: string
	error: Error | undefined
	messages: UIMessage[]
	abortRef: MutableRefObject<AbortController | null>
	setFollowUpSuggestions: (suggestions: string[]) => void
	setFollowUpHidden: (hidden: boolean) => void
}) {
	useEffect(() => {
		if (status !== "ready" || error || !lastAssistantHasText(messages)) {
			return
		}
		abortRef.current?.abort()
		const controller = new AbortController()
		abortRef.current = controller
		let ignore = false
		void (async () => {
			try {
				const response = await fetch(CHAT_SUGGESTIONS_API, {
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
						"X-Timezone": TIME_ZONE,
						...(demoMode
							? { "X-Ledger-Demo": demoPersona.id }
							: {}),
					},
					body: JSON.stringify({ messages }),
					signal: controller.signal,
				})
				if (!response.ok || controller.signal.aborted || ignore) {
					return
				}
				const data = (await response.json()) as {
					suggestions?: string[]
				}
				if (controller.signal.aborted || ignore) {
					return
				}
				setFollowUpSuggestions(data.suggestions ?? [])
				setFollowUpHidden(false)
			} catch {
				// Ignore network errors and stale/aborted requests.
			}
		})()
		return () => {
			ignore = true
			controller.abort()
		}
	}, [
		status,
		error,
		messages,
		abortRef,
		setFollowUpSuggestions,
		setFollowUpHidden,
	])
}

/** Opens the panel and drains queued Ask Ledger prompts from other pages. */
export function useAskLedgerQueueDrain({
	busy,
	setOpen,
	submitText,
}: {
	busy: boolean
	setOpen: Dispatch<SetStateAction<boolean>>
	submitText: (text: string) => void
}) {
	const drainQueue = useEffectEvent(() => {
		if (peekAskLedgerQueue().length === 0) {
			return
		}
		setOpen(true)
		if (busy) {
			return
		}
		const next = shiftAskLedgerQueue()
		if (next) {
			submitText(next)
		}
	})

	useEffect(() => subscribeAskLedger(drainQueue), [])

	useEffect(() => {
		drainQueue()
		// oxlint-disable-next-line react/exhaustive-effect-dependencies -- drain when streaming ends
	}, [busy])
}

/** Closes the chat panel on Escape. Clicking elsewhere (e.g. navigating) leaves it open. */
export function useChatPanelDismiss({
	open,
	newChatConfirmOpen,
	closePanel,
}: {
	open: boolean
	newChatConfirmOpen: boolean
	closePanel: () => void
}) {
	useEffect(() => {
		if (!open) {
			return
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || newChatConfirmOpen) {
				return
			}
			closePanel()
		}
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [open, newChatConfirmOpen, closePanel])
}
