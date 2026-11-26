"use client"

import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Mail. */
export interface MailIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface MailIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const MailIcon = forwardRef<MailIconHandle, MailIconProps>(
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
					<rect height="16" rx="2" width="20" x="2" y="4" />
					<m.path
						animate={controls}
						d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"
						initial="normal"
						style={{ originX: "12px", originY: "7px" }}
						transition={{
							type: "spring",
							stiffness: 280,
							damping: 18,
						}}
						variants={{
							normal: { rotate: 0, y: 0 },
							animate: { rotate: -4, y: -1 },
						}}
					/>
				</svg>
			</div>
		)
	}
)

MailIcon.displayName = "MailIcon"

export { MailIcon }
