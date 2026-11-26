"use client"

import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating CalendarClock. */
export interface CalendarClockIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface CalendarClockIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const CalendarClockIcon = forwardRef<
	CalendarClockIconHandle,
	CalendarClockIconProps
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
				<path d="M16 2v3" />
				<path d="M8 2v3" />
				<path d="M21 8.936V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h3.935" />
				<path d="M3 9h9.873" />
				<circle cx="17" cy="17" r="5" />
				<m.path
					animate={controls}
					d="M17 15.5v1.7l1 .625"
					initial="normal"
					style={{ originX: "17px", originY: "17px" }}
					transition={{ type: "spring", stiffness: 200, damping: 14 }}
					variants={{
						normal: { rotate: 0 },
						animate: { rotate: 45 },
					}}
				/>
			</svg>
		</div>
	)
})

CalendarClockIcon.displayName = "CalendarClockIcon"

export { CalendarClockIcon }
