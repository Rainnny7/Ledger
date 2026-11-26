import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group"
import { cn } from "cn"
import type { ChatStatus } from "ai"
import { CornerDownLeftIcon, Loader2Icon, SquareIcon } from "lucide-react"
import {
	type ComponentProps,
	type FormEvent,
	type FormEventHandler,
	type HTMLAttributes,
	type KeyboardEventHandler,
	forwardRef,
	useState,
} from "react"

/** Text plus optional files submitted from the prompt field. */
export type PromptInputMessage = {
	text: string
	files: []
}

/** Form wrapper for the chat prompt control. */
export type PromptInputProps = Omit<
	HTMLAttributes<HTMLFormElement>,
	"onSubmit"
> & {
	onSubmit: (
		message: PromptInputMessage,
		event: FormEvent<HTMLFormElement>
	) => void | Promise<void>
}

/** Form wrapper for the chat prompt control. */
export function PromptInput({
	className,
	onSubmit,
	children,
	...props
}: PromptInputProps) {
	const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
		event.preventDefault()
		const formData = new FormData(event.currentTarget)
		const text = (formData.get("message") as string) ?? ""
		void onSubmit({ text, files: [] }, event)
	}

	return (
		<form
			className={cn("w-full", className)}
			onSubmit={handleSubmit}
			{...props}
		>
			<InputGroup className="h-auto items-end gap-0 overflow-hidden py-0.5 text-[13px]">
				{children}
			</InputGroup>
		</form>
	)
}

/** Multi-line prompt field with Enter-to-send. */
export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>

/** Multi-line prompt field with Enter-to-send. */
export const PromptInputTextarea = forwardRef<
	HTMLTextAreaElement,
	PromptInputTextareaProps
>(function PromptInputTextarea(
	{ onChange, className, placeholder = "Ask a question…", ...props },
	ref
) {
	const [isComposing, setIsComposing] = useState(false)

	const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (
		event
	) => {
		if (event.key !== "Enter") {
			return
		}
		if (isComposing || event.nativeEvent.isComposing || event.shiftKey) {
			return
		}
		event.preventDefault()
		const form = event.currentTarget.form
		const submitButton = form?.querySelector(
			'button[type="submit"]'
		) as HTMLButtonElement | null
		if (submitButton?.disabled) {
			return
		}
		form?.requestSubmit()
	}

	return (
		<InputGroupTextarea
			ref={ref}
			className={cn(
				"field-sizing-content max-h-32 min-h-0 py-1.5 text-[13px]",
				className
			)}
			name="message"
			onCompositionEnd={() => setIsComposing(false)}
			onCompositionStart={() => setIsComposing(true)}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			rows={2}
			onChange={onChange}
			{...props}
		/>
	)
})

/** Bottom row for submit / stop actions. */
export type PromptInputFooterProps = Omit<
	ComponentProps<typeof InputGroupAddon>,
	"align"
>

/** Bottom row for submit / stop actions. */
export function PromptInputFooter({
	className,
	...props
}: PromptInputFooterProps) {
	return (
		<InputGroupAddon
			align="block-end"
			className={cn(
				"justify-end gap-1 border-t border-border/60 pt-1",
				className
			)}
			{...props}
		/>
	)
}

/** Icon button sized for the prompt input footer. */
export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton>

/** Icon button sized for the prompt input footer. */
export function PromptInputButton({
	variant = "ghost",
	size = "icon-sm",
	...props
}: PromptInputButtonProps) {
	return (
		<InputGroupButton
			size={size}
			type="button"
			variant={variant}
			{...props}
		/>
	)
}

/** Submit control that reflects chat status (spinner / stop icon). */
export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
	status?: ChatStatus
}

/** Submit control that reflects chat status (spinner / stop icon). */
export function PromptInputSubmit({
	className,
	variant = "default",
	size = "icon-sm",
	status,
	children,
	...props
}: PromptInputSubmitProps) {
	let icon = <CornerDownLeftIcon className="size-4" />
	if (status === "submitted") {
		icon = <Loader2Icon className="size-4 animate-spin" />
	} else if (status === "streaming") {
		icon = <SquareIcon className="size-4 fill-current" />
	}

	return (
		<InputGroupButton
			aria-label="Send message"
			className={cn(className)}
			size={size}
			type="submit"
			variant={variant}
			{...props}
		>
			{children ?? icon}
		</InputGroupButton>
	)
}
