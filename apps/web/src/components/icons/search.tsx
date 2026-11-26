"use client"

import type { Variants } from "motion/react"
import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Search. */
export interface SearchIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface SearchIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const SEARCH_VARIANTS: Variants = {
	normal: { rotate: 0 },
	animate: {
		rotate: [0, -10, 8, -5, 0],
		transition: { duration: 0.5, ease: "easeInOut" },
	},
}

const SearchIcon = forwardRef<SearchIconHandle, SearchIconProps>(
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
					initial="normal"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2"
					style={{ originX: "35%", originY: "35%" }}
					variants={SEARCH_VARIANTS}
					viewBox="0 0 24 24"
					width={size}
					xmlns="http://www.w3.org/2000/svg"
				>
					<path d="m21 21-4.34-4.34" />
					<circle cx="11" cy="11" r="8" />
				</m.svg>
			</div>
		)
	}
)

SearchIcon.displayName = "SearchIcon"

export { SearchIcon }
