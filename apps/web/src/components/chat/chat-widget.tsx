import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { ChatMessageRow } from "@/components/chat/chat-message-row"
import { ChatWidgetEmptyState } from "@/components/chat/chat-widget-empty-state"
import {
	ChatWidgetInputFooter,
	ChatWidgetThinking,
} from "@/components/chat/chat-widget-input-footer"
import { ChatWidgetNewChatControl } from "@/components/chat/chat-widget-new-chat"
import { useChatWidgetPanel } from "@/components/chat/use-chat-widget-panel"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAppConfig } from "@/lib/queries"
import { cn } from "cn"
import { MessageCircle, X } from "lucide-react"
import { AnimatePresence, m, useReducedMotion } from "motion/react"

/** Floating AI chat: panel UI wired to POST /api/banks/chat. */
export function ChatWidgetPanel() {
	const reduceMotion = useReducedMotion()
	const {
		messages,
		status,
		stop,
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
	} = useChatWidgetPanel()

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
								<ChatWidgetNewChatControl
									messagesEmpty={messages.length === 0}
									confirmOpen={newChatConfirmOpen}
									onConfirmOpenChange={setNewChatConfirmOpen}
									onNewChatClick={handleNewChatClick}
									onResetChat={resetChat}
								/>
							</header>

							<Conversation className="min-h-0 flex-1">
								<ConversationContent className="min-h-full pb-1">
									{messages.length === 0 ? (
										<ChatWidgetEmptyState
											busy={busy}
											onSubmit={submitText}
										/>
									) : (
										<>
											{messages.map((message) => (
												<ChatMessageRow
													key={message.id}
													message={message}
												/>
											))}
											<ChatWidgetThinking
												show={showThinking}
											/>
										</>
									)}
								</ConversationContent>
								<ConversationScrollButton />
							</Conversation>

							<ChatWidgetInputFooter
								busy={busy}
								status={status}
								input={input}
								displayError={displayError}
								showFollowUps={showFollowUps}
								followUpSuggestions={followUpSuggestions}
								textareaRef={textareaRef}
								onInputChange={setInput}
								onSubmit={submitText}
								onStop={stop}
								onFollowUp={(text) => {
									setFollowUpHidden(true)
									submitText(text)
								}}
							/>
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
