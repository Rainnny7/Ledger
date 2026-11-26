"use client"

import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Share2. */
export interface Share2IconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface Share2IconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const Share2Icon = forwardRef<Share2IconHandle, Share2IconProps>(
	({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
				<m.svg
					animate={controls}
					fill="none"
					height={size}
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2"
					transition={{ type: "spring", stiffness: 260, damping: 18 }}
					variants={{
						normal: { scale: 1 },
						animate: { scale: [1, 1.08, 1] },
					}}
					viewBox="0 0 24 24"
					width={size}
					style={{ originX: "50%", originY: "50%" }}
					xmlns="http://www.w3.org/2000/svg"
				>
					<circle cx="18" cy="5" r="3" />
					<circle cx="6" cy="12" r="3" />
					<circle cx="18" cy="19" r="3" />
					<path d="M8.59 13.51 15.42 17.49" />
					<path d="M15.41 6.51 8.59 10.49" />
				</m.svg>
			</div>
		)
	}
)

Share2Icon.displayName = "Share2Icon"

export { Share2Icon }
