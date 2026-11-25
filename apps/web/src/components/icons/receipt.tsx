"use client"

import type { Variants } from "motion/react"
import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Receipt. */
export interface ReceiptIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface ReceiptIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

// The receipt gives a little print-out hop while its lines write themselves in.
const PAPER_VARIANTS: Variants = {
	normal: { y: 0 },
	animate: {
		y: [0, -2, 0],
		transition: { duration: 0.45, ease: "easeOut" },
	},
}

const LINE_VARIANTS: Variants = {
	normal: { pathLength: 1, opacity: 1 },
	animate: (i: number) => ({
		pathLength: [0, 1],
		opacity: [0, 1],
		transition: { duration: 0.3, delay: 0.1 + i * 0.1, ease: "easeOut" },
	}),
}

const ReceiptIcon = forwardRef<ReceiptIconHandle, ReceiptIconProps>(
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
						variants={PAPER_VARIANTS}
					>
						<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
						{["M8 8h8", "M8 12h8", "M8 16h5"].map(
							(pathData, index) => (
								<m.path
									animate={controls}
									custom={index}
									d={pathData}
									initial="normal"
									key={pathData}
									variants={LINE_VARIANTS}
								/>
							)
						)}
					</m.g>
				</svg>
			</div>
		)
	}
)

ReceiptIcon.displayName = "ReceiptIcon"

export { ReceiptIcon }
