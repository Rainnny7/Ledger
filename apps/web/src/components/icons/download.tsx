"use client"

import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating Download. */
export interface DownloadIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface DownloadIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const DownloadIcon = forwardRef<DownloadIconHandle, DownloadIconProps>(
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
					<path d="M12 15V3" />
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<m.path
						animate={controls}
						d="m7 10 5 5 5-5"
						initial="normal"
						transition={{
							type: "spring",
							stiffness: 400,
							damping: 14,
						}}
						variants={{
							normal: { y: 0 },
							animate: { y: [0, 3, 0] },
						}}
					/>
				</svg>
			</div>
		)
	}
)

DownloadIcon.displayName = "DownloadIcon"

export { DownloadIcon }
