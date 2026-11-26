"use client"

import type { Variants } from "motion/react"
import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Pencil. */
export interface PencilIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface PencilIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const PENCIL_VARIANTS: Variants = {
	normal: { rotate: 0, x: 0 },
	animate: {
		rotate: [0, -8, 6, -4, 0],
		x: [0, 1, -1, 0],
		transition: { duration: 0.55, ease: "easeInOut" },
	},
}

const PencilIcon = forwardRef<PencilIconHandle, PencilIconProps>(
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
						style={{ originX: "6px", originY: "18px" }}
						variants={PENCIL_VARIANTS}
					>
						<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
						<path d="m15 5 4 4" />
					</m.g>
				</svg>
			</div>
		)
	}
)

PencilIcon.displayName = "PencilIcon"

export { PencilIcon }
