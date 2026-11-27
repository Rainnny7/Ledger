import { useId } from "react"
import { cn } from "cn"

const HEIGHT = 32
const PAD = 2

/**
 * Minimal filled-area line sparkline (no axes). Uses theme chart colour via `currentColor`.
 */
export function Sparkline({
	values,
	className,
}: {
	values: number[]
	className?: string
}) {
	const id = useId()
	const gradientId = `${id}-area`

	if (values.length < 2) {
		return null
	}

	const min = Math.min(...values)
	const max = Math.max(...values)
	const span = max - min || 1
	const inner = HEIGHT - PAD * 2

	const coords = values.map((value, index) => {
		const x = (index / (values.length - 1)) * 100
		const y = PAD + ((max - value) / span) * inner
		return { x, y }
	})

	const line = coords
		.map((point, index) =>
			index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
		)
		.join(" ")
	const area = `${line} L 100 ${HEIGHT} L 0 ${HEIGHT} Z`

	return (
		<svg
			viewBox={`0 0 100 ${HEIGHT}`}
			preserveAspectRatio="none"
			className={cn("h-8 w-full text-chart-1", className)}
			style={{ animation: "ledger-sweep 900ms ease-out backwards" }}
			aria-hidden
		>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop
						offset="0%"
						stopColor="currentColor"
						stopOpacity={0.34}
					/>
					<stop
						offset="100%"
						stopColor="currentColor"
						stopOpacity={0}
					/>
				</linearGradient>
			</defs>
			<path d={area} fill={`url(#${gradientId})`} />
			<path
				d={line}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	)
}
