"use client"

import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating ArrowRight. */
export interface ArrowRightIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface ArrowRightIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const ArrowRightIcon = forwardRef<ArrowRightIconHandle, ArrowRightIconProps>(
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
					transition={{ type: "spring", stiffness: 300, damping: 20 }}
					variants={{
						normal: { x: 0 },
						animate: { x: [0, 3, 0] },
					}}
					viewBox="0 0 24 24"
					width={size}
					xmlns="http://www.w3.org/2000/svg"
				>
					<path d="M5 12h14" />
					<path d="m12 5 7 7-7 7" />
				</m.svg>
			</div>
		)
	}
)

ArrowRightIcon.displayName = "ArrowRightIcon"

export { ArrowRightIcon }
