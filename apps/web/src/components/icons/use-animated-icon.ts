import type { ComponentType, HTMLAttributes, RefAttributes } from "react"
import { useMemo, useRef, type ForwardRefExoticComponent } from "react"

/** What every lucide-animated icon exposes through its ref. */
export interface AnimatedIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

/** Props shared by animated icon wrappers. */
export type AnimatedIconProps = HTMLAttributes<HTMLDivElement> & {
	size?: number
}

/** Component type for nav, palettes, and other icon slots. */
export type AnimatedIconComponent = ForwardRefExoticComponent<
	AnimatedIconProps & RefAttributes<AnimatedIconHandle>
>

/** Whether an icon slot uses our motion wrapper (displayName ends with `Icon`). */
export function isAnimatedIconComponent(
	icon: AnimatedIconComponent | ComponentType<{ className?: string }>
): icon is AnimatedIconComponent {
	const name = (icon as { displayName?: string }).displayName ?? ""
	return name.endsWith("Icon")
}

const reducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/**
 * Lets a bigger target (a nav link, a menu item, a button) play its icon's animation on hover or
 * keyboard focus, rather than only when the pointer is over the icon itself.
 */
export function useAnimatedIcon<T extends HTMLElement = HTMLElement>() {
	const ref = useRef<AnimatedIconHandle>(null)
	return useMemo(() => {
		const start = () => {
			if (!reducedMotion()) {
				ref.current?.startAnimation()
			}
		}
		const stop = () => ref.current?.stopAnimation()
		return {
			ref,
			handlers: {
				onMouseEnter: start,
				onMouseLeave: stop,
				onFocus: (event: React.FocusEvent<T>) => {
					if (event.currentTarget.matches(":focus-visible")) {
						start()
					}
				},
				onBlur: stop,
			},
		}
	}, [])
}
