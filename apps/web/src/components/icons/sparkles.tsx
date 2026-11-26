"use client"

import type { Variants } from "motion/react"
import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Sparkles. */
export interface SparklesIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface SparklesIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const MAIN_VARIANTS: Variants = {
	normal: { rotate: 0, scale: 1 },
	animate: {
		rotate: [0, 12, -8, 0],
		scale: [1, 1.06, 1],
		transition: { duration: 0.55, ease: "easeInOut" },
	},
}

const SparklesIcon = forwardRef<SparklesIconHandle, SparklesIconProps>(
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
					<m.g
						animate={controls}
						initial="normal"
						style={{ originX: "50%", originY: "50%" }}
						variants={MAIN_VARIANTS}
					>
						<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
					</m.g>
					<m.path
						animate={controls}
						d="M20 2v4"
						initial="normal"
						variants={{
							normal: { opacity: 1, pathLength: 1 },
							animate: { opacity: [0.4, 1, 0.4], pathLength: 1 },
						}}
					/>
					<m.path
						animate={controls}
						d="M22 4h-4"
						initial="normal"
						variants={{
							normal: { opacity: 1 },
							animate: { opacity: [0.4, 1, 0.4] },
						}}
					/>
					<m.circle
						animate={controls}
						cx="4"
						cy="20"
						initial="normal"
						r="2"
						variants={{
							normal: { scale: 1 },
							animate: { scale: [1, 1.3, 1] },
						}}
					/>
				</svg>
			</div>
		)
	}
)

SparklesIcon.displayName = "SparklesIcon"

export { SparklesIcon }
