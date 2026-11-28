import { PlusIcon } from "@/components/icons/plus"
import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover"

/** Header control to confirm clearing the current chat. */
export function ChatWidgetNewChatControl({
	messagesEmpty,
	confirmOpen,
	onConfirmOpenChange,
	onNewChatClick,
	onResetChat,
}: {
	messagesEmpty: boolean
	confirmOpen: boolean
	onConfirmOpenChange: (open: boolean) => void
	onNewChatClick: () => void
	onResetChat: () => void
}) {
	return (
		<Popover
			open={confirmOpen}
			onOpenChange={(next) => {
				if (!messagesEmpty || !next) {
					onConfirmOpenChange(next)
				}
			}}
		>
			<PopoverTrigger
				render={
					<Button
						type="button"
						size="sm"
						aria-label="New chat"
						onClick={onNewChatClick}
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
					<PopoverTitle>Start a new chat?</PopoverTitle>
					<PopoverDescription>
						This clears the current conversation. The current chat
						stays in your history.
					</PopoverDescription>
				</PopoverHeader>
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => onConfirmOpenChange(false)}
					>
						Cancel
					</Button>
					<Button type="button" size="sm" onClick={onResetChat}>
						New chat
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	)
}
