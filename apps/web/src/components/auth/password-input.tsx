import { Eye, EyeOff } from "lucide-react"
import { useId, useState } from "react"
import { Input } from "@/components/ui/input"

/**
 * Password field with a show/hide toggle and a caps-lock hint. All other props go to the input,
 * so `autoComplete`, `aria-invalid` and friends work as usual.
 */
export function PasswordInput({
	"aria-describedby": describedBy,
	onKeyDown,
	onKeyUp,
	onBlur,
	...props
}: Omit<React.ComponentProps<"input">, "type">) {
	const [visible, setVisible] = useState(false)
	const [capsLock, setCapsLock] = useState(false)
	const hintId = useId()
	const Icon = visible ? EyeOff : Eye
	return (
		<>
			<div className="relative">
				<Input
					{...props}
					type={visible ? "text" : "password"}
					className="pr-9"
					aria-describedby={
						[describedBy, capsLock ? hintId : null]
							.filter(Boolean)
							.join(" ") || undefined
					}
					onKeyDown={(event) => {
						setCapsLock(event.getModifierState("CapsLock"))
						onKeyDown?.(event)
					}}
					onKeyUp={(event) => {
						setCapsLock(event.getModifierState("CapsLock"))
						onKeyUp?.(event)
					}}
					onBlur={(event) => {
						setCapsLock(false)
						onBlur?.(event)
					}}
				/>
				<button
					type="button"
					aria-label={visible ? "Hide password" : "Show password"}
					aria-pressed={visible}
					className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
					onClick={() => setVisible((current) => !current)}
				>
					<Icon aria-hidden className="size-4" />
				</button>
			</div>
			{capsLock && (
				<p
					id={hintId}
					role="status"
					className="text-xs text-amber-600 dark:text-amber-400"
				>
					Caps Lock is on.
				</p>
			)}
		</>
	)
}
