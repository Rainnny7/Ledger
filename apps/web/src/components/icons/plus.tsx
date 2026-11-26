"use client"

import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Plus. */
export interface PlusIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface PlusIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const PlusIcon = forwardRef<PlusIconHandle, PlusIconProps>(
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
					style={{ originX: "50%", originY: "50%" }}
					transition={{ type: "spring", stiffness: 200, damping: 18 }}
					variants={{
						normal: { rotate: 0 },
						animate: { rotate: 90 },
					}}
					viewBox="0 0 24 24"
					width={size}
					xmlns="http://www.w3.org/2000/svg"
				>
					<path d="M5 12h14" />
					<path d="M12 5v14" />
				</m.svg>
			</div>
		)
	}
)

PlusIcon.displayName = "PlusIcon"

export { PlusIcon }
