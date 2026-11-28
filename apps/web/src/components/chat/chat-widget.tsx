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
import {
	ChatWidgetHistoryControl,
	ChatWidgetSettingsControl,
} from "@/components/chat/chat-widget-header-controls"
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
		history,
		settings,
		updateSettings,
		size,
		startResize,
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
					"pointer-events-auto flex max-w-full flex-col items-end gap-3"
				)}
			>
				<AnimatePresence>
					{open ? (
						<m.section
							ref={panelRef}
							key="ask-ledger-panel"
							aria-label="Ask Ledger chat"
							className="relative flex origin-bottom-right flex-col overflow-hidden rounded-xl border bg-popover text-[13px] text-popover-foreground shadow-lg ring-1 ring-foreground/10"
							style={{
								transformOrigin: "100% 100%",
								width: size.width,
								height: size.height,
								maxWidth: "calc(100vw - 2rem)",
								maxHeight: "calc(100dvh - 5rem)",
							}}
							{...panelMotion}
						>
							<div
								aria-hidden
								className="absolute inset-y-3 left-0 z-10 w-1.5 cursor-ew-resize touch-none"
								onPointerDown={(event) =>
									startResize(event, {
										horizontal: true,
										vertical: false,
									})
								}
							/>
							<div
								aria-hidden
								className="absolute inset-x-3 top-0 z-10 h-1.5 cursor-ns-resize touch-none"
								onPointerDown={(event) =>
									startResize(event, {
										horizontal: false,
										vertical: true,
									})
								}
							/>
							<div
								aria-hidden
								className="absolute top-0 left-0 z-20 size-3 cursor-nwse-resize touch-none"
								onPointerDown={(event) =>
									startResize(event, {
										horizontal: true,
										vertical: true,
									})
								}
							/>
							<header className="flex shrink-0 items-center justify-between gap-1.5 border-b px-2.5 py-2">
								<h2 className="text-[13px] font-semibold">
									Ask Ledger
								</h2>
								<div className="flex items-center gap-1">
									<ChatWidgetHistoryControl
										conversations={history.conversations}
										activeId={history.activeId}
										onOpen={(id) => {
											if (!busy) {
												history.openConversation(id)
											}
										}}
										onDelete={history.deleteConversation}
									/>
									<ChatWidgetSettingsControl
										settings={settings}
										onChange={updateSettings}
									/>
									<ChatWidgetNewChatControl
										messagesEmpty={messages.length === 0}
										confirmOpen={newChatConfirmOpen}
										onConfirmOpenChange={
											setNewChatConfirmOpen
										}
										onNewChatClick={handleNewChatClick}
										onResetChat={resetChat}
									/>
								</div>
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
													settings={settings}
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
