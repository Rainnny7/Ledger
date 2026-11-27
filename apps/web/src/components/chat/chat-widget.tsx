import { PlusIcon } from "@/components/icons/plus"
import { SparklesIcon } from "@/components/icons/sparkles"
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Loader } from "@/components/ai-elements/loader"
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message"
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { ToolStatusChip } from "@/components/ai-elements/tool"
import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { demoMode, demoPersona } from "@/lib/demo"
import { useAppConfig } from "@/lib/queries"
import { useChat } from "@ai-sdk/react"
import {
	DefaultChatTransport,
	isTextUIPart,
	isToolUIPart,
	type ToolUIPart,
	type UIMessage,
} from "ai"
import { cn } from "cn"
import { MessageCircle, Square, X } from "lucide-react"
import { AnimatePresence, m, useReducedMotion } from "motion/react"
import {
	askLedgerRevision,
	peekAskLedgerQueue,
	shiftAskLedgerQueue,
	subscribeAskLedger,
} from "@/lib/ask-ledger"
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react"

const CHAT_API = "/api/banks/chat"
const CHAT_SUGGESTIONS_API = "/api/banks/chat/suggestions"
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const SUGGESTED_QUESTIONS = [
	"What did I spend on groceries last month?",
	"Which subscriptions am I paying for?",
	"How is my savings goal progressing?",
	"What were my biggest expenses this year?",
] as const

const TOOL_STATUS_LABEL = "Checking your transactions…"

function parseErrorBody(body: string | undefined): string | null {
	if (!body) {
		return null
	}
	try {
		const parsed = JSON.parse(body) as { error?: string }
		return parsed.error ?? null
	} catch {
		return null
	}
}

/** Parse the server `{ error }` body from a failed chat request. */
function chatErrorMessage(error: Error): string {
	const responseBody =
		"responseBody" in error && typeof error.responseBody === "string"
			? error.responseBody
			: undefined
	const fromResponse = parseErrorBody(responseBody)
	if (fromResponse) {
		return fromResponse
	}
	const fromMessage = parseErrorBody(error.message)
	if (fromMessage) {
		return fromMessage
	}
	return error.message || "Something went wrong. Try again."
}

function toolStatusLabel(_part: ToolUIPart): string {
	return TOOL_STATUS_LABEL
}

function lastAssistantHasText(messages: UIMessage[]): boolean {
	const last = messages.at(-1)
	if (last?.role !== "assistant") {
		return false
	}
	return last.parts.some(
		(part) => isTextUIPart(part) && part.text.trim().length > 0
	)
}

/** One row in the scrollable message list. */
function ChatMessageRow({ message }: { message: UIMessage }) {
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
				{toolParts.map((part, index) => (
					<ToolStatusChip
						key={`${message.id}-tool-${index}`}
						label={toolStatusLabel(part)}
						state={part.state}
					/>
				))}
				{textParts.map((textPart, index) => (
					<MessageResponse key={`${message.id}-text-${index}`}>
						{textPart.text}
					</MessageResponse>
				))}
			</MessageContent>
		</Message>
	)
}

/** Floating AI chat: panel UI wired to POST /api/banks/chat. */
function ChatWidgetPanel() {
	const reduceMotion = useReducedMotion()

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

	const {
		messages,
		sendMessage,
		status,
		stop,
		setMessages,
		error,
		clearError,
	} = useChat({ transport })

	const [input, setInput] = useState("")
	const [open, setOpen] = useState(false)
	const [newChatConfirmOpen, setNewChatConfirmOpen] = useState(false)
	const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([])
	const [followUpHidden, setFollowUpHidden] = useState(false)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const panelRef = useRef<HTMLElement>(null)
	const toggleRef = useRef<HTMLButtonElement>(null)
	const suggestionsAbortRef = useRef<AbortController | null>(null)

	const busy = status === "submitted" || status === "streaming"
	const askRevision = useSyncExternalStore(
		subscribeAskLedger,
		askLedgerRevision,
		askLedgerRevision
	)
	const displayError = error ? chatErrorMessage(error) : null
	const showThinking =
		busy &&
		(messages.length === 0 ||
			messages.at(-1)?.role === "user" ||
			(messages.at(-1)?.role === "assistant" &&
				!messages
					.at(-1)
					?.parts.some(
						(part) =>
							isTextUIPart(part) && part.text.trim().length > 0
					)))

	const panelMotion = reduceMotion
		? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
		: {
				initial: { opacity: 0, scale: 0.94, y: 10, x: 6 },
				animate: {
					opacity: 1,
					scale: 1,
					y: 0,
					x: 0,
					transition: {
						duration: 0.18,
						ease: [0, 0, 0.2, 1] as const,
					},
				},
				exit: {
					opacity: 0,
					scale: 0.96,
					y: 8,
					x: 4,
					transition: {
						duration: 0.12,
						ease: [0.4, 0, 1, 1] as const,
					},
				},
			}

	const submitText = useCallback(
		(text: string) => {
			const trimmed = text.trim()
			if (!trimmed || busy) {
				return
			}
			suggestionsAbortRef.current?.abort()
			setFollowUpSuggestions([])
			setFollowUpHidden(true)
			clearError()
			void sendMessage({ text: trimmed })
			setInput("")
		},
		[busy, clearError, sendMessage]
	)

	const resetChat = useCallback(() => {
		suggestionsAbortRef.current?.abort()
		void stop()
		setMessages([])
		clearError()
		setInput("")
		setFollowUpSuggestions([])
		setFollowUpHidden(false)
		setNewChatConfirmOpen(false)
		textareaRef.current?.focus()
	}, [clearError, setMessages, stop])

	const handleNewChatClick = useCallback(() => {
		if (messages.length === 0) {
			resetChat()
		}
	}, [messages.length, resetChat])

	const showFollowUps =
		!busy && !followUpHidden && followUpSuggestions.length > 0

	useEffect(() => {
		if (status !== "ready" || error || !lastAssistantHasText(messages)) {
			return
		}
		suggestionsAbortRef.current?.abort()
		const controller = new AbortController()
		suggestionsAbortRef.current = controller
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
				if (!response.ok || controller.signal.aborted) {
					return
				}
				const data = (await response.json()) as {
					suggestions?: string[]
				}
				if (controller.signal.aborted) {
					return
				}
				setFollowUpSuggestions(data.suggestions ?? [])
				setFollowUpHidden(false)
			} catch {
				// Ignore network errors and stale/aborted requests.
			}
		})()
		return () => {
			controller.abort()
		}
	}, [status, error, messages])

	// Contextual "Ask Ledger" buttons queue prompts elsewhere in the app: open the panel and send
	// the next one whenever the chat is idle (re-runs on every queue change, even if already open).
	useEffect(() => {
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
	}, [askRevision, busy, submitText])

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
			// Fullscreen tables, code and images open in a portal outside the panel; clicking their
			// close button must not count as clicking away from the chat.
			if (target.closest('[role="dialog"], [data-streamdown]')) {
				return false
			}
		}
		return true
	}, [])

	useEffect(() => {
		if (!open) {
			return
		}
		const onPointerDown = (event: MouseEvent | TouchEvent) => {
			if (newChatConfirmOpen) {
				return
			}
			if (!clickIsOutsidePanel(event.target)) {
				return
			}
			closePanel()
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || newChatConfirmOpen) {
				return
			}
			closePanel()
		}
		document.addEventListener("mousedown", onPointerDown)
		document.addEventListener("touchstart", onPointerDown)
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.removeEventListener("mousedown", onPointerDown)
			document.removeEventListener("touchstart", onPointerDown)
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [open, newChatConfirmOpen, clickIsOutsidePanel, closePanel])

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 print:hidden">
			<div
				className={cn(
					"pointer-events-auto flex flex-col items-end gap-3",
					open && "w-full sm:w-auto"
				)}
			>
				<AnimatePresence>
					{open ? (
						<m.section
							ref={panelRef}
							key="ask-ledger-panel"
							aria-label="Ask Ledger chat"
							className="flex h-[min(520px,calc(100dvh-5rem))] w-full origin-bottom-right flex-col overflow-hidden rounded-xl border bg-popover text-[13px] text-popover-foreground shadow-lg ring-1 ring-foreground/10 sm:h-[520px] sm:w-[360px]"
							style={{ transformOrigin: "100% 100%" }}
							{...panelMotion}
						>
							<header className="flex shrink-0 items-center justify-between gap-1.5 border-b px-2.5 py-2">
								<h2 className="text-[13px] font-semibold">
									Ask Ledger
								</h2>
								<Popover
									open={newChatConfirmOpen}
									onOpenChange={(next) => {
										if (messages.length > 0 || !next) {
											setNewChatConfirmOpen(next)
										}
									}}
								>
									<PopoverTrigger
										render={
											<Button
												type="button"
												size="sm"
												aria-label="New chat"
												onClick={handleNewChatClick}
											/>
										}
									>
										<PlusIcon size={24} className="flex" />
										New chat
									</PopoverTrigger>
									<PopoverContent
										className="w-64 gap-3 p-3"
										align="end"
										sideOffset={6}
									>
										<PopoverHeader>
											<PopoverTitle>
												Start a new chat?
											</PopoverTitle>
											<PopoverDescription>
												This clears the current
												conversation. Chats aren't
												saved, so it can't be brought
												back.
											</PopoverDescription>
										</PopoverHeader>
										<div className="flex justify-end gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() =>
													setNewChatConfirmOpen(false)
												}
											>
												Cancel
											</Button>
											<Button
												type="button"
												size="sm"
												onClick={resetChat}
											>
												New chat
											</Button>
										</div>
									</PopoverContent>
								</Popover>
							</header>

							<Conversation className="min-h-0 flex-1">
								<ConversationContent className="min-h-full pb-1">
									{messages.length === 0 ? (
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
														Ask about your spending,
														subscriptions, goals, or
														accounts.
													</p>
												</div>
												<Suggestions className="w-full justify-center">
													{SUGGESTED_QUESTIONS.map(
														(question) => (
															<Suggestion
																key={question}
																suggestion={
																	question
																}
																disabled={busy}
																onClick={
																	submitText
																}
															/>
														)
													)}
												</Suggestions>
											</div>
										</ConversationEmptyState>
									) : (
										<>
											{messages.map((message) => (
												<ChatMessageRow
													key={message.id}
													message={message}
												/>
											))}
											{showThinking ? (
												<div
													className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
													aria-live="polite"
												>
													<Loader size={14} />
													<span>Thinking…</span>
												</div>
											) : null}
										</>
									)}
								</ConversationContent>
								<ConversationScrollButton />
							</Conversation>

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
										{followUpSuggestions.map(
											(suggestion) => (
												<Suggestion
													key={suggestion}
													suggestion={suggestion}
													disabled={busy}
													onClick={(text) => {
														setFollowUpHidden(true)
														submitText(text)
													}}
												/>
											)
										)}
									</Suggestions>
								) : null}
								<p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
									Private to you. Only the data needed to
									answer is sent to the AI model.
								</p>
								<PromptInput
									onSubmit={({ text }) => submitText(text)}
								>
									<PromptInputTextarea
										ref={textareaRef}
										value={input}
										disabled={busy}
										aria-label="Message"
										onChange={(event) =>
											setInput(event.target.value)
										}
									/>
									<PromptInputFooter>
										{busy ? (
											<PromptInputButton
												aria-label="Stop response"
												variant="destructive"
												className="border-destructive/40 bg-destructive text-white hover:bg-destructive/90 hover:text-white"
												onClick={() => void stop()}
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
						</m.section>
					) : null}
				</AnimatePresence>

				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								ref={toggleRef}
								type="button"
								size="icon-lg"
								className="size-12 rounded-full shadow-lg"
								aria-label={
									open
										? "Close Ask Ledger chat"
										: "Open Ask Ledger chat"
								}
								aria-expanded={open}
								onClick={toggleOpen}
							/>
						}
					>
						<m.span
							className="inline-flex"
							animate={
								reduceMotion
									? undefined
									: { rotate: open ? 90 : 0 }
							}
							transition={{ duration: 0.2 }}
						>
							{open ? (
								<X className="size-5" />
							) : (
								<MessageCircle className="size-5" />
							)}
						</m.span>
					</TooltipTrigger>
					<TooltipContent side="left">
						{open ? "Close chat" : "Ask Ledger"}
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	)
}

/**
 * Lazy-loaded floating chat entry: shown when the server enables AI chat (demo mode included: it reads the demo data).
 */
export function ChatWidget() {
	const config = useAppConfig()
	if (!config?.aiChat) {
		return null
	}
	return <ChatWidgetPanel />
}
