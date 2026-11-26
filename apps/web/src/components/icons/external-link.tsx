"use client"

import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating ExternalLink. */
export interface ExternalLinkIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface ExternalLinkIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const ExternalLinkIcon = forwardRef<
	ExternalLinkIconHandle,
	ExternalLinkIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
	const controls = useAnimation()
	const isControlledRef = useRef(false)

	useImperativeHandle(ref, () => {
		isControlledRef.current = true

		return {
			startAnimation: () => controls.start("animate"),
			stopAnimation: () => controls.start("normal"),
		}
	})

	const handleMouseEnter = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (isControlledRef.current) {
				onMouseEnter?.(event)
			} else {
				controls.start("animate")
			}
		},
		[controls, onMouseEnter]
	)

	const handleMouseLeave = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (isControlledRef.current) {
				onMouseLeave?.(event)
			} else {
				controls.start("normal")
			}
		},
		[controls, onMouseLeave]
	)

	return (
		<div
			className={cn(className)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			{...props}
		>
			<svg
				fill="none"
				height={size}
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				viewBox="0 0 24 24"
				width={size}
				xmlns="http://www.w3.org/2000/svg"
			>
				<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
				<m.g
					animate={controls}
					initial="normal"
					transition={{ type: "spring", stiffness: 320, damping: 20 }}
					variants={{
						normal: { x: 0, y: 0 },
						animate: { x: 2, y: -2 },
					}}
				>
					<path d="M15 3h6v6" />
					<path d="M10 14 21 3" />
				</m.g>
			</svg>
		</div>
	)
})

ExternalLinkIcon.displayName = "ExternalLinkIcon"

export { ExternalLinkIcon }
