import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import type { ChatSettings } from "@/components/chat/chat-storage"
import type { StoredConversation } from "@/components/chat/chat-storage"
import { cn } from "cn"
import { History, Settings2, Trash2 } from "lucide-react"

/** Header popover listing saved conversations; pick one to continue it. */
export function ChatWidgetHistoryControl({
	conversations,
	activeId,
	onOpen,
	onDelete,
}: {
	conversations: StoredConversation[]
	activeId: string | null
	onOpen: (id: string) => void
	onDelete: (id: string) => void
}) {
	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						aria-label="Chat history"
					/>
				}
			>
				<History className="size-4" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 gap-2 p-2"
				align="end"
				sideOffset={6}
			>
				<PopoverHeader className="px-1">
					<PopoverTitle>Chat history</PopoverTitle>
				</PopoverHeader>
				{conversations.length === 0 ? (
					<Empty className="p-4">
						<EmptyHeader>
							<EmptyDescription>
								Your past chats will show up here.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<ScrollArea className="max-h-72 overflow-y-auto">
						<ul className="space-y-0.5">
							{conversations.map((conversation) => (
								<li
									key={conversation.id}
									className={cn(
										"group flex items-center gap-1 rounded-md hover:bg-muted",
										conversation.id === activeId &&
											"bg-muted"
									)}
								>
									<button
										type="button"
										className="min-w-0 flex-1 px-2 py-1.5 text-left"
										onClick={() => onOpen(conversation.id)}
									>
										<span className="block truncate text-xs font-medium">
											{conversation.title}
										</span>
										<span className="block text-[11px] text-muted-foreground">
											{new Date(
												conversation.updatedAt
											).toLocaleString(undefined, {
												dateStyle: "medium",
												timeStyle: "short",
											})}
										</span>
									</button>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={`Delete chat: ${conversation.title}`}
										onClick={() =>
											onDelete(conversation.id)
										}
									>
										<Trash2 className="size-3.5" />
									</Button>
								</li>
							))}
						</ul>
					</ScrollArea>
				)}
			</PopoverContent>
		</Popover>
	)
}

/** Header popover with switches for showing tool calls and model reasoning in replies. */
export function ChatWidgetSettingsControl({
	settings,
	onChange,
}: {
	settings: ChatSettings
	onChange: (patch: Partial<ChatSettings>) => void
}) {
	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						aria-label="Chat settings"
					/>
				}
			>
				<Settings2 className="size-4" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 gap-3 p-3"
				align="end"
				sideOffset={6}
			>
				<PopoverHeader>
					<PopoverTitle>Chat settings</PopoverTitle>
				</PopoverHeader>
				<Label className="flex items-start justify-between gap-3 font-normal">
					<span>
						<span className="block text-xs font-medium">
							Show tool calls
						</span>
						<span className="block text-[11px] text-muted-foreground">
							Display which tools the assistant ran, with inputs
							and results.
						</span>
					</span>
					<Switch
						checked={settings.showToolCalls}
						onCheckedChange={(checked) =>
							onChange({ showToolCalls: checked })
						}
					/>
				</Label>
				<Label className="flex items-start justify-between gap-3 font-normal">
					<span>
						<span className="block text-xs font-medium">
							Show reasoning
						</span>
						<span className="block text-[11px] text-muted-foreground">
							Display the model's thinking when it provides any.
						</span>
					</span>
					<Switch
						checked={settings.showReasoning}
						onCheckedChange={(checked) =>
							onChange({ showReasoning: checked })
						}
					/>
				</Label>
			</PopoverContent>
		</Popover>
	)
}
