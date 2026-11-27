import { Check } from "lucide-react"
import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "cn"

const FLASH_MS = 1800

/** Props for {@link SavedIndicator}. */
export type SavedIndicatorProps = {
	/** Whether the saved state is visible. */
	saved: boolean
	/** Show the “Saved” label next to the check (default true). */
	showLabel?: boolean
	className?: string
}

/**
 * Brief inline confirmation: check icon with optional “Saved” text.
 * Pair with {@link useSavedFlash}; reserve space with `showLabel` so layout doesn’t shift.
 */
export function SavedIndicator({
	saved,
	showLabel = true,
	className,
}: SavedIndicatorProps) {
	const reduceMotion = useReducedMotion()
	return (
		<span
			className={cn(
				"inline-flex h-5 shrink-0 items-center",
				showLabel ? "min-w-[4.25rem]" : "min-w-5 justify-center",
				className
			)}
			aria-live="polite"
			aria-atomic
		>
			<AnimatePresence initial={false} mode="popLayout">
				{saved ? (
					<m.span
						key="saved"
						className="inline-flex items-center gap-1 text-primary"
						initial={
							reduceMotion
								? { opacity: 0 }
								: { opacity: 0, scale: 0.85 }
						}
						animate={
							reduceMotion
								? { opacity: 1 }
								: { opacity: 1, scale: 1 }
						}
						exit={
							reduceMotion
								? { opacity: 0 }
								: { opacity: 0, scale: 0.85 }
						}
						transition={{ duration: 0.18, ease: "easeOut" }}
					>
						<Check className="size-3.5 shrink-0" aria-hidden />
						{showLabel ? (
							<span className="text-xs font-medium">Saved</span>
						) : null}
					</m.span>
				) : null}
			</AnimatePresence>
		</span>
	)
}

/**
 * Controls a short “saved” flash (~1.8s). Clears the timer on re-flash and unmount.
 */
export function useSavedFlash(durationMs = FLASH_MS) {
	const [saved, setSaved] = useState(false)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const flash = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current)
		}
		setSaved(true)
		timerRef.current = setTimeout(() => {
			setSaved(false)
			timerRef.current = null
		}, durationMs)
	}, [durationMs])

	useEffect(
		() => () => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current)
			}
		},
		[]
	)

	return { saved, flash }
}
