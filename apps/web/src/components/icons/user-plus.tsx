"use client"

import { m, useAnimation } from "motion/react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"

import { cn } from "cn"

/** Ref handle for animating UserPlus. */
export interface UserPlusIconHandle {
	startAnimation: () => void
	stopAnimation: () => void
}

interface UserPlusIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number
}

const UserPlusIcon = forwardRef<UserPlusIconHandle, UserPlusIconProps>(
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
					<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<m.g
						animate={controls}
						initial="normal"
						transition={{
							type: "spring",
							stiffness: 320,
							damping: 18,
						}}
						variants={{
							normal: { scale: 1, rotate: 0 },
							animate: { scale: [1, 1.15, 1], rotate: 90 },
						}}
						style={{ originX: "19px", originY: "11px" }}
					>
						<path d="M19 8v6" />
						<path d="M22 11h-6" />
					</m.g>
				</svg>
			</div>
		)
	}
)

UserPlusIcon.displayName = "UserPlusIcon"

export { UserPlusIcon }
