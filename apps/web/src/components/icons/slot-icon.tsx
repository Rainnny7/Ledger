import type { LucideIcon } from "lucide-react"
import type { Ref } from "react"

import {
	type AnimatedIconComponent,
	type AnimatedIconHandle,
	isAnimatedIconComponent,
} from "@/components/icons/use-animated-icon"
import { cn } from "cn"

/** Tailwind size-* class for common lucide pixel sizes. */
function sizeClass(pixels: number): string | undefined {
	switch (pixels) {
		case 12:
			return "size-3"
		case 14:
			return "size-3.5"
		case 16:
			return "size-4"
		case 20:
			return "size-5"
		case 24:
			return "size-6"
		default:
			return undefined
	}
}

/** Renders either a motion icon or a plain lucide icon in mixed icon slots. */
export function SlotIcon({
	icon: Icon,
	size = 16,
	className,
	iconRef,
}: {
	icon: AnimatedIconComponent | LucideIcon
	size?: number
	className?: string
	iconRef?: Ref<AnimatedIconHandle>
}) {
	if (isAnimatedIconComponent(Icon)) {
		return (
			<Icon ref={iconRef} size={size} className={cn("flex", className)} />
		)
	}
	return <Icon className={cn(sizeClass(size), className)} />
}
