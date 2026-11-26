"use client"

import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Check. */
export interface CheckIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface CheckIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const CheckIcon = forwardRef<CheckIconHandle, CheckIconProps>(
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
					<m.path
						animate={controls}
						d="M20 6 9 17l-5-5"
						initial="normal"
						transition={{ duration: 0.35, ease: "easeOut" }}
						variants={{
							normal: { pathLength: 1, opacity: 1 },
							animate: {
								pathLength: [0, 1],
								opacity: 1,
							},
						}}
					/>
				</svg>
			</div>
		)
	}
)

CheckIcon.displayName = "CheckIcon"

export { CheckIcon }
