import { createElement } from "react"
import { Money } from "@/components/common/money"
import {
	goalColor,
	goalIcon,
	STATUS_META,
	tintStyle,
} from "@/components/goals/goal-meta"
import type { Goal, GoalStatus } from "@/lib/api"
import { formatDate, formatRelativeDate } from "@/lib/format"
import { cn } from "cn"

/** Goal Icon. */
export function GoalIcon({
	goal,
	className,
}: {
	goal: Pick<Goal, "icon" | "color">
	className?: string
}) {
	return (
		<span
			className={cn(
				"grid size-10 shrink-0 place-items-center rounded-xl",
				className
			)}
			style={tintStyle(goal.color)}
		>
			{createElement(goalIcon(goal.icon), { className: "size-[50%]" })}
		</span>
	)
}

/** Circular progress with the percentage in the middle. */
export function GoalRing({
	goal,
	size = 72,
	stroke = 7,
	className,
}: {
	goal: Pick<Goal, "progress" | "color">
	size?: number
	stroke?: number
	className?: string
}) {
	const radius = (size - stroke) / 2
	const len = 2 * Math.PI * radius
	const color = goalColor(goal.color)
	return (
		<div
			className={cn("relative shrink-0", className)}
			style={{ width: size, height: size }}
		>
			<svg
				width={size}
				height={size}
				viewBox={`0 0 ${size} ${size}`}
				className="-rotate-90"
				aria-hidden
			>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					strokeWidth={stroke}
					className="stroke-muted"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke={color}
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={len}
					strokeDashoffset={len * (1 - goal.progress)}
					className="transition-[stroke-dashoffset] duration-700 ease-out"
				/>
			</svg>
			<span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">
				{Math.floor(goal.progress * 100)}%
			</span>
		</div>
	)
}

/** Goal Bar. */
export function GoalBar({
	goal,
	className,
}: {
	goal: Pick<Goal, "progress" | "color">
	className?: string
}) {
	return (
		<div
			className={cn(
				"h-2 w-full overflow-hidden rounded-full bg-muted",
				className
			)}
		>
			<div
				className="h-full rounded-full transition-[width] duration-700 ease-out"
				style={{
					width: `${Math.max(goal.progress > 0 ? 2 : 0, goal.progress * 100)}%`,
					backgroundColor: goalColor(goal.color),
				}}
			/>
		</div>
	)
}

/** Goal Status Pill. */
export function GoalStatusPill({
	status,
	className,
}: {
	status: GoalStatus
	className?: string
}) {
	const meta = STATUS_META[status]
	return (
		<span
			className={cn(
				"inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
				meta.className,
				className
			)}
		>
			{meta.label}
		</span>
	)
}

/** One encouraging line: what it takes, or when you'll get there. */
export function GoalNudge({ goal }: { goal: Goal }) {
	const money = (amount: number) => (
		<Money value={amount} currency={goal.currency} />
	)
	const verb = goal.kind === "payoff" ? "pay" : "save"
	if (goal.status === "done") {
		return goal.kind === "payoff"
			? "Paid off — nice work!"
			: "Goal reached — nice work!"
	}
	if (goal.status === "overdue") {
		return "The target date has passed"
	}
	if (
		goal.neededPerWeek !== null &&
		goal.neededPerMonth !== null &&
		goal.targetDate
	) {
		const Verb = verb[0].toUpperCase() + verb.slice(1)
		const per =
			goal.daysLeft !== null && goal.daysLeft < 45 ? (
				<>{money(goal.neededPerWeek)}/week</>
			) : (
				<>{money(goal.neededPerMonth)}/month</>
			)
		return (
			<>
				{Verb} {per} to reach it by {formatDate(goal.targetDate)}
			</>
		)
	}
	if (goal.projectedDate) {
		return `At your pace you’ll get there ${formatRelativeDate(goal.projectedDate)}`
	}
	return goal.saved > 0
		? "Keep logging payments as you make them"
		: "Log your first payment to get started"
}
