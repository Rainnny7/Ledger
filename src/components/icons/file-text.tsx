"use client"

import type { Variants } from "motion/react"
import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating FileText. */
export interface FileTextIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface FileTextIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const SWAY_VARIANTS: Variants = {
	normal: {
		rotate: 0,
		transition: {
			duration: 0.3,
			ease: "easeOut",
		},
	},
	animate: {
		rotate: [0, 4, -3, 2, 0],
		transition: {
			duration: 0.9,
			ease: "easeInOut",
			times: [0, 0.25, 0.5, 0.75, 1],
		},
	},
}

const FileTextIcon = forwardRef<FileTextIconHandle, FileTextIconProps>(
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
					style={{ transformOrigin: "12px 22px" }}
					variants={SWAY_VARIANTS}
					viewBox="0 0 24 24"
					width={size}
					xmlns="http://www.w3.org/2000/svg"
				>
					<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
					<path d="M14 2v4a2 2 0 0 0 2 2h4" />
					<path d="M10 9H8" />
					<path d="M16 13H8" />
					<path d="M16 17H8" />
				</m.svg>
			</div>
		)
	}
)

FileTextIcon.displayName = "FileTextIcon"

export { FileTextIcon }
