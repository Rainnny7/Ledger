"use client"

import type { Variants } from "motion/react"
import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Calculator. */
export interface CalculatorIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface CalculatorIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

// The calculator gives a small hop while its keys light up one after another.
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
		transition: { duration: 0.3, delay: 0.05 + i * 0.05, ease: "easeOut" },
	}),
}

const CalculatorIcon = forwardRef<CalculatorIconHandle, CalculatorIconProps>(
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
						<rect height="20" rx="2" width="16" x="4" y="2" />
						<path d="M8 6h8" />
						{[
							"M8 10h.01",
							"M12 10h.01",
							"M16 10h.01",
							"M8 14h.01",
							"M12 14h.01",
							"M16 14h.01",
							"M8 18h.01",
							"M12 18h4",
						].map((pathData, index) => (
							<m.path
								animate={controls}
								custom={index}
								d={pathData}
								initial="normal"
								key={pathData}
								variants={LINE_VARIANTS}
							/>
						))}
					</m.g>
				</svg>
			</div>
		)
	}
)

CalculatorIcon.displayName = "CalculatorIcon"

export { CalculatorIcon }
